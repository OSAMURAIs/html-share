# Presentation profiles

A **presentation profile** is an immutable, versioned bundle of managed presentation
assets served from `/assets/v5/<version>/`. Profiles are additive: an existing profile is
never edited once published, because that namespace is served `immutable` for a year.

| Profile | Namespace | Status |
| --- | --- | --- |
| `1` | `/assets/v5/1/` | **Production.** The default. |
| `2` | `/assets/v5/2/` | **Candidate.** Visual reconstruction; inactive. |

## The safety property

> Merging candidate presentation code cannot, on its own, change what production publishes.

Profile `2` exists in the repository and is fully buildable, but nothing selects it unless
a human writes it into configuration. `test/presentation-profile.test.ts` is the gate: it
asserts the default resolves to `1`, that a default build stages no `/assets/v5/2/` file
into the content root, and that the shipped example configuration does not set a profile.

Activation is one deliberate, reviewed configuration change:

```yaml
presentation:
  profile: "2"
```

Absent, malformed, or `null` means profile `1`. An unknown version is a hard error rather
than a silent fallback.

## How the profile flows

`presentation.profile` is read once in `loadConfig` into `HtmlShareConfig.presentationVersion`,
resolved by `resolvePresentationProfile`, and threaded explicitly to every consumer:

- `copyManagedV5Assets` stages only that profile's `staged_assets`.
- `bundleHtml` exempts only that profile's assets from local-asset inlining.
- `readGeneratedV5Metadata` requires the page's declared `presentation-version` to equal
  the selected profile's.
- `buildManifestV2` / `validateManifestV2` record and enforce the same profile.

Selection is a config key and a function parameter, never an ambient environment variable.

### Cross-profile content fails closed, twice

A page declaring one profile cannot be built under another. Two independent mechanisms
reject it, and the earlier one wins in practice:

1. Only the *selected* profile's assets are exempt from local-asset inlining, so a foreign
   asset reference is treated as a missing local file and the build throws.
2. `readGeneratedV5Metadata` rejects a mismatched `presentation-version` outright.

## Asset shape

Profile `1` is a single stylesheet plus a single script, required in every page.

Profile `2` splits authoring into a core loaded by every page and one sheet per domain:

```
/assets/v5/2/tokens.css  primitives.css  shell.css  motion.css  presentation.js
/assets/v5/2/domains/{home,research,personal,investment,live-work}.css
```

`assets` are required in every page; `domain_assets` are per-domain and a page may
reference **only** its own domain's sheet — referencing another domain's is an error, so
domain styling cannot quietly become a global stylesheet. `staged_assets` is everything
copied and published, and is a superset of both.

## Deployment requirement before profile 2 is activated

**Not performed. Recorded for a future, independently reviewed infrastructure change.**

`infra/lib/html-share-stack.ts` defines a CloudFront additional behavior keyed on the
literal prefix `assets/v5/1/*`. Profile `2` assets do not match it and would fall through
to the content distribution's **default** behavior, which differs in two ways that matter:

| | `assets/v5/1/*` behavior | Default behavior |
| --- | --- | --- |
| Cache policy | 365-day edge cache | `CACHING_DISABLED` |
| Viewer access | no `trustedKeyGroups` | `trustedKeyGroups` — signed access required |

So activating profile `2` without an infrastructure change would both lose edge caching and
place presentation assets behind signed access, which the browser shell does not currently
request for stylesheets.

The prepared change is to generalize that behavior key from `assets/v5/1/*` to
`assets/v5/*`, keeping the cache policy and the absent `trustedKeyGroups`, so every
versioned profile is served identically. **The IaC was deliberately left unmodified in
V1**; no CDK was deployed and no AWS resource was mutated.

Ordering for a future rollout: deploy the generalized behavior first, publish profile `2`
assets second, and only then activate the profile in configuration.
