# Changelog

## 2.0.0 — local package

- Added explicit automatic Windows shutdown after successful full queue, plus 60–600 second OS countdown and cancellation.
- Corrected local UI to distinguish Pause vs Shutdown; safer status display and result-link override.
- Preserved provider file codes and alternate download/embed URLs for DoodStream link troubleshooting.
- Added secure read-only mobile PWA, public GitHub Pages workflow, Supabase owner+agent RLS schema and auth-based agent sync (no service_role secrets).
- Added Roman Urdu and English setup/upgrade/public release instructions.
- Expanded local/mock testing suite; kept original streaming upload adapters and V1 queue migration.

### Verification boundary

Automated tests use mock providers and mocked Windows/Supabase operations. V1 was live tested by its owner previously. The V2 configuration, actual GitHub Pages deployment and live Windows shutdown have not been run against the owner's accounts in this session.

## V2.2 — Queue control and safe GitHub release
- Per-job **Move to top**, **Hold**, **Resume job**, and **Remove** (pending/held only).
- Folder-based bulk pending/held queue removal with explicit preview and confirmation. Original files remain untouched.
- Runtime queue edits suppress automatic shutdown for that specific running batch.
- Localhost API controls, persistent queue ordering and statuses, 5 new regression tests.
- Separate Roman Urdu GitHub command guide and safe media file ignore patterns.
