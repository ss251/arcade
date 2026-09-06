import { assertManifestPublishable, credentialOf, toPublicListing, type SkillManifest } from "../../core/src/manifest.ts"
import { advisoryFor } from "../../core/src/engine.ts"

/** Canonical CLI projection of an already-decoded local manifest. No IO, execution
 * or environment lookup. Private configuration is for the local seller only;
 * only public is the hub payload. A generated target need not exist on disk. */
export const createPublishPreview = (target: string, manifest: SkillManifest) => {
  assertManifestPublishable(manifest)
  const credential = credentialOf(manifest), advisory = advisoryFor(manifest.engine.adapter, credential)
  return {
    target,
    skillId: manifest.id,
    engine: { adapter: manifest.engine.adapter, credential },
    grants: [...manifest.engine.capabilities],
    ...(advisory === undefined ? {} : { advisory }),
    public: toPublicListing(manifest),
    private: { engine: manifest.engine, secrets: manifest.secrets, egress: manifest.egress, workdir: manifest.workdir }
  }
}

export type PublishPreview = ReturnType<typeof createPublishPreview>
