// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IERC165} from "@openzeppelin/contracts/utils/introspection/IERC165.sol";
import {ERC8183} from "erc8183/ERC8183.sol";
import {IERC8183Hook} from "erc8183/IERC8183Hook.sol";

/// @notice Binds funded ARCADE jobs to one evaluator and commits its receipt metadata.
/// @dev The escrow remains upgradeable/admin-controlled. Events attest to supplied
///      metadata, not independent verification of off-chain execution or tree contents.
contract ArcadeJobHook is IERC8183Hook {
    ERC8183 public immutable escrow;
    address public immutable evaluator;

    error InvalidBinding();
    error OnlyEscrow();
    error WrongEvaluator();

    event ArcadeSettled(
        uint256 indexed jobId,
        bytes32 treeHash,
        uint32 childCount,
        uint256 childTotalAtomic,
        bytes32 receiptHash
    );
    event ArcadeRefused(uint256 indexed jobId, bytes32 reason);

    constructor(address escrow_, address evaluator_) {
        if (escrow_.code.length == 0 || evaluator_ == address(0)) revert InvalidBinding();
        escrow = ERC8183(escrow_);
        evaluator = evaluator_;
    }

    modifier onlyEscrow() {
        if (msg.sender != address(escrow)) revert OnlyEscrow();
        _;
    }

    function supportsInterface(bytes4 interfaceId) external pure override returns (bool) {
        return interfaceId == type(IERC8183Hook).interfaceId || interfaceId == type(IERC165).interfaceId;
    }

    function beforeAction(uint256 jobId, bytes4 selector, bytes calldata) external view override onlyEscrow {
        if (selector == ERC8183.fund.selector && escrow.getJob(jobId).evaluator != evaluator) {
            revert WrongEvaluator();
        }
    }

    function afterAction(uint256 jobId, bytes4 selector, bytes calldata data) external override onlyEscrow {
        // The pinned escrow wraps optParams with actor and reason for both actions.
        if (selector == ERC8183.complete.selector) {
            (,, bytes memory optParams) = abi.decode(data, (address, bytes32, bytes));
            (bytes32 treeHash, uint32 childCount, uint256 childTotalAtomic, bytes32 receiptHash) =
                abi.decode(optParams, (bytes32, uint32, uint256, bytes32));
            emit ArcadeSettled(jobId, treeHash, childCount, childTotalAtomic, receiptHash);
        } else if (selector == ERC8183.reject.selector) {
            (, bytes32 reason,) = abi.decode(data, (address, bytes32, bytes));
            emit ArcadeRefused(jobId, reason);
        }
    }
}
