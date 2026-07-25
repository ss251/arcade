// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @notice Minimal EIP-3009 surface of Arc USDC (FiatTokenV2).
interface IFiatToken {
    /// @dev Unlike `receiveWithAuthorization`, this has NO msg.sender restriction — anyone
    ///      may submit a valid authorization. That is what lets THIS contract submit one on
    ///      the buyer's behalf and split in the same call, using the exact signature every
    ///      standard x402 client already produces.
    function transferWithAuthorization(
        address from,
        address to,
        uint256 value,
        uint256 validAfter,
        uint256 validBefore,
        bytes32 nonce,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external;

    function transfer(address to, uint256 value) external returns (bool);

    function balanceOf(address account) external view returns (uint256);
}

/**
 * @title FeeSplitter
 * @notice Collects ARCADE's platform fee atomically, without custody of the seller's money
 *         and without any privileged party able to redirect it.
 *
 * @dev WHY THIS EXISTS
 *
 * `transferWithAuthorization` pays `payTo` the full price, so if `payTo` were the seller the
 * platform fee could only be an off-chain claim against a wallet we do not control — an
 * uncollectable take-rate. Asking the buyer to sign two authorizations would collect it but
 * breaks interop: a standards-compliant x402 client signs exactly one authorization to
 * exactly one `payTo`. So `payTo` is this contract, and it splits on receipt.
 *
 * Front-running is a non-issue despite `transferWithAuthorization` being permissionless: the
 * only destination this contract can ever pay is its immutable `seller`, so a stranger
 * submitting the authorization merely completes the payment the buyer already intended.
 *
 * @dev ONE SPLITTER PER SELLER — this is the security design, not a convenience
 *
 * v1 took `seller` as a runtime argument to `settle`. A 12-agent audit converged on that
 * single parameter as the root defect, with three independent escalations:
 *   1. EIP-3009 signs only (from, to, value, validAfter, validBefore, nonce) — the seller is
 *      NOT in anything the buyer signs, so a caller could name any address and take the
 *      ~95% seller leg (not merely the fee, as v1's own docstring wrongly claimed).
 *   2. `seller = address(this)` made `transfer` a no-op self-transfer returning true, and
 *      `seller = address(usdc)` was an unrecoverable burn — both slipping past a
 *      zero-address-only check, with the event still reporting a payout that never happened.
 *   3. With several settlers (the point of a multi-entry allowlist), any settler could
 *      front-run another's in-flight settle using the same signature, spending the nonce and
 *      reverting the honest one.
 *
 * Every one of those needs a `seller` argument to exist. Here it does not: `seller` is
 * immutable, set at deployment, and the buyer's authorization names THIS contract, which
 * therefore names that seller. Misdirection is unrepresentable rather than merely guarded.
 *
 * Consequently `settle` needs no access control at all and is permissionless — there is no
 * settler role to compromise, and nothing an attacker gains by calling it, since the only
 * possible destination is the seller the buyer already chose by paying this address.
 *
 * @dev FEES ARE PULLED, NOT PUSHED
 *
 * USDC can blacklist addresses. If `settle` pushed the fee to an immutable `treasury` and
 * that address were ever blacklisted, every non-dust settlement would revert forever and the
 * contract would be bricked. Fees therefore accrue here and `withdrawFees` pushes them
 * separately, so a blacklisted treasury breaks withdrawals only. Seller funds never rest.
 *
 * @dev The fee rounds UP. Flooring meant any payment below ceil(10000/feeBps) atomic units
 *      paid a literal 0% — and on a marketplace whose floor is $0.000001, that band is real.
 */
contract FeeSplitter {
    /// @notice Arc USDC — also the native gas token; this is its 6-decimal ERC-20 face.
    IFiatToken public immutable usdc;

    /// @notice The ONLY address that can ever receive the seller share. Immutable.
    address public immutable seller;

    /// @notice Where fees are withdrawn to. Immutable.
    address public immutable treasury;

    /// @notice Platform fee in basis points. Immutable. 500 = 5%.
    uint16 public immutable feeBps;

    /// @notice Fees accrued and not yet withdrawn, in 6-decimal atomic units.
    uint256 public accruedFees;

    uint16 private constant BPS_DENOMINATOR = 10_000;
    /// @dev Hard ceiling so no deployment can configure a confiscatory rate.
    uint16 private constant MAX_FEE_BPS = 1_000; // 10%

    /// @dev Non-reentrancy. The token is a Circle-operated upgradeable proxy; if it ever
    ///      gained a transfer hook, the external calls below could re-enter. Cheap insurance
    ///      against a dependency we do not control.
    uint256 private _locked = 1;

    event Settled(
        address indexed buyer, uint256 total, uint256 sellerAmount, uint256 feeAmount, bytes32 indexed nonce
    );
    event FeesWithdrawn(address indexed to, uint256 amount);

    error ZeroAddress();
    error InvalidSeller();
    error FeeTooHigh();
    error SellerTransferFailed();
    error FeeTransferFailed();
    error UnexpectedAmountReceived();
    error Reentrancy();
    error NothingToWithdraw();

    constructor(address _usdc, address _seller, address _treasury, uint16 _feeBps) {
        if (_usdc == address(0) || _seller == address(0) || _treasury == address(0)) {
            revert ZeroAddress();
        }
        // Close the poisoned-recipient class at construction: a splitter can never be
        // deployed pointing at itself or at the token, so `transfer` can never be a silent
        // self-transfer or an unrecoverable burn.
        if (_seller == _usdc || _seller == address(this)) revert InvalidSeller();
        if (_feeBps > MAX_FEE_BPS) revert FeeTooHigh();

        usdc = IFiatToken(_usdc);
        seller = _seller;
        treasury = _treasury;
        feeBps = _feeBps;
    }

    modifier nonReentrant() {
        if (_locked != 1) revert Reentrancy();
        _locked = 2;
        _;
        _locked = 1;
    }

    /**
     * @notice Redeem a buyer's signed authorization and pay the seller, retaining the fee.
     * @dev Permissionless by construction — the destination is fixed, so there is nothing to
     *      steal by calling this and no role to compromise. Replay protection is delegated to
     *      the token, which marks each (authorizer, nonce) pair used and reverts on reuse; we
     *      deliberately do not duplicate that bookkeeping.
     */
    function settle(
        address from,
        uint256 value,
        uint256 validAfter,
        uint256 validBefore,
        bytes32 nonce,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external nonReentrant {
        uint256 balanceBefore = usdc.balanceOf(address(this));

        // Reverts on a bad signature, a closed window, or a reused nonce.
        //
        // MUST be transferWithAuthorization, not receiveWithAuthorization: the two have
        // DIFFERENT EIP-712 typehashes ("TransferWithAuthorization(...)" vs
        // "ReceiveWithAuthorization(...)" — same fields, different struct name, different
        // digest). Every x402 client, ours and Circle's CLI alike, signs the Transfer variant;
        // a signature for one does not recover to `from` under the other. Using the receive
        // variant here would revert on EVERY call.
        usdc.transferWithAuthorization(from, address(this), value, validAfter, validBefore, nonce, v, r, s);

        // Guard against a token whose credited amount differs from `value` (fee-on-transfer
        // or rebasing). USDC is neither, but asserting removes the assumption entirely.
        if (usdc.balanceOf(address(this)) - balanceBefore != value) revert UnexpectedAmountReceived();

        // Round the fee UP: flooring let small payments pay literally nothing.
        uint256 feeAmount = (value * feeBps + BPS_DENOMINATOR - 1) / BPS_DENOMINATOR;
        // Safe: feeBps <= MAX_FEE_BPS (1000) < BPS_DENOMINATOR (10000), so feeAmount < value
        // for any value >= 1, and feeAmount == 0 only when value == 0.
        uint256 sellerAmount = value - feeAmount;

        accruedFees += feeAmount;

        if (sellerAmount > 0) {
            if (!usdc.transfer(seller, sellerAmount)) revert SellerTransferFailed();
        }

        emit Settled(from, value, sellerAmount, feeAmount, nonce);
    }

    /**
     * @notice Send accrued fees to the treasury. Permissionless — the destination is
     *         immutable, so anyone may trigger it and no one can redirect it.
     * @dev Separated from `settle` precisely so a blacklisted treasury cannot brick payments.
     */
    function withdrawFees() external nonReentrant {
        uint256 amount = accruedFees;
        if (amount == 0) revert NothingToWithdraw();
        accruedFees = 0;
        if (!usdc.transfer(treasury, amount)) revert FeeTransferFailed();
        emit FeesWithdrawn(treasury, amount);
    }

    /// @notice Preview the split. Lets anyone verify a receipt against the deployed code.
    function quote(uint256 value) external view returns (uint256 sellerAmount, uint256 feeAmount) {
        feeAmount = (value * feeBps + BPS_DENOMINATOR - 1) / BPS_DENOMINATOR;
        sellerAmount = value - feeAmount;
    }

    /**
     * @notice USDC sitting here beyond `accruedFees` — i.e. sent by mistake outside `settle`.
     * @dev Recoverable only to the seller, and only the excess. There is deliberately no
     *      admin and no arbitrary-destination sweep: v1's admin `sweep` combined with a
     *      poisoned recipient to let a privileged caller take 100% of a trade.
     */
    function rescueStrandedToSeller() external nonReentrant {
        uint256 bal = usdc.balanceOf(address(this));
        uint256 excess = bal > accruedFees ? bal - accruedFees : 0;
        if (excess == 0) revert NothingToWithdraw();
        if (!usdc.transfer(seller, excess)) revert SellerTransferFailed();
    }
}
