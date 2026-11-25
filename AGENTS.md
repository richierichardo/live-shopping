<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->Live shopping project rules
Product intent and current milestone
The product goal is a local live virtual try-on where a garment follows the user and visually covers the original clothing within supported conditions.

Current milestone: validate the tracked landmarks and the actual upper-body 3D skeleton before continuing garment fitting.

Default development view: webcam, tracked landmarks, and projected actual skeleton joints with distinct colors and a legend. Keep garment rendering available for later comparison, but hide it in skeleton diagnostics.

Current scope is one person, frontal poses and small body turns. Full side/back tracking is a later milestone until independently validated.

The user's explicit task and constraints take precedence. Within that task, inspect these instructions and current code before editing. Treat earlier reviews as hypotheses to verify, not instructions to preserve incorrect behavior.
Execution and scope
- Implement and validate the authorized task; continue through routine reversible implementation decisions without repeated confirmation.
- Preserve unrelated storefront, cart, checkout, order, and shipment behavior.
- Make focused changes with an explicit reason and corresponding evidence.
- Keep OrthographicCamera for the current skeleton milestone so solver changes can be compared against the baseline. Evaluate perspective as a separate follow-up.
- Keep camera frames on-device. MediaPipe pretrained pose tracking is allowed. Fitting, retargeting, skinning, compositing, and rendering use local deterministic algorithms.
- Generative image/video models, remote virtual try-on APIs, server GPU inference, training, and camera-frame uploads are outside the authorized architecture.
- Preserve the generated Next.js instructions above.
Coordinate and skeleton invariants
Document source video, crop, mirror, screen pixels, MediaPipe world, skeleton-local, parent-bone, and renderer world spaces. Apply crop and mirror exactly once. Convert units explicitly.

Preserve depth information for arm directions. Verify handedness, axis conventions, bind pose, joint indexing, and inverse bind matrices against the actual asset.

Solve hierarchical chains parent-first:
1. Calculate and apply the upper-arm rotation including the selected filter.
2. Update the relevant matrices.
3. Read the actual model elbow position and current parent transform.
4. Solve and apply the forearm rotation relative to that updated parent.
5. Update matrices and read actual joint positions.
Do not calculate child-local rotations against a reset or stale parent. Derive rest directions and wrist/end anchors explicitly.

The solver's segment lengths must match effective skeleton lengths after ancestor transforms. Compensate inherited scale or use joint offsets; avoid multiplying independent length ratios through uniform parent/child scale.

Use the same definitions for shoulder sockets, arm origins, and joint targets. Separate skeleton alignment from garment dimensions: changing hem length must not shift shoulder or pelvis anchors.

Calculate debug errors from actual transformed joints projected by the active camera, including root translation, rotation, scale, bone transforms, and filtering.

Runtime and tests must share the same solver and transformation functions.
Calibration and tracking
- Estimate relative proportions from sufficiently confident samples and reject outliers.
- Expose calibration state and reset. Bound calibration drift when pose confidence falls.
- Use delta-time-based filtering with a documented settling behavior.
- Handle acquiring, tracking, degraded, and lost states explicitly.
- Bound reuse/prediction of stale poses and show pose age. Do not present a held pose as a fresh observation.
- Report tracking limits rather than silently forcing invalid poses into the solver.
- Treat landmark alignment as alignment to an estimate, not verified anatomical accuracy or centimeter measurement.
Required diagnostics
Expose inference/render FPS separately; inference/render durations; pose age; per-joint confidence; tracking state; calibration state; selected delegate; asset/fallback status; target/effective segment lengths; and projected joint errors in pixels and percentage of shoulder span.

Show tracked and actual skeleton joints together, with connecting error lines and a legend. Report missing or low-confidence landmarks separately from solver residuals.

Diagnostics must describe the running pipeline. Report GPU/CPU and fallback only after successful initialization. Surface failures clearly.
Verification and acceptance
Run relevant regression tests, typecheck, and build using repository scripts. Report unavailable or failed checks honestly.

Use the actual Three.js hierarchy for solver regression tests. Cover:
- Rest pose and arms extended.
- Bent elbow.
- Upper-arm rotation while maintaining the desired forearm direction.
- Nonzero depth: hand moving toward the chest/camera.
- Unequal upper-arm and forearm lengths.
- Nonidentity root rotation.
- Repeated frames with different delta times.
- Hem changes without skeleton-anchor movement.
Assert actual joint positions and directions after matrix updates, not just helper-generated target points, quaternion finiteness, or positive scale.

For exactly representable synthetic poses within joint limits, use tight numerical tolerances with explicit units. Test filtering after a defined settling duration. Separate solver convergence from deliberate clamping or noisy observations.

Regression tests must demonstrate that the former stale-parent and inherited-scale behaviors are detected. Do not relax tolerances merely to make failing tests pass.

For live or suitable prerecorded input, exercise frontal standing, arms extended, elbows bent, one arm raised, a hand in front of the chest, and brief tracking loss/recovery. Record supported-condition results and remaining failures.

A phone recording of a laptop screen is visual evidence with perspective, reflection, and resampling artifacts. Prefer raw webcam imagery for tracking evaluation. Treat screen recordings as limited evidence if used as input.

When webcam or target hardware is unavailable, finish feasible deterministic checks and identify the live/hardware checks as unverified. Never claim a live test, FPS result, or device capability that was not observed.

A passing build or helper unit test alone does not establish visual correctness. The milestone is complete only when actual chain transforms and lengths pass regression checks and supported-condition visual validation is documented. Otherwise report the precise incomplete portion.
Handoff
Summarize:
1. Confirmed root causes and remaining hypotheses.
2. Changed files and resulting behavior.
3. Checks performed, outcomes, and measured metrics.
4. How to run the skeleton diagnostics.
5. Known limits and unverified checks.
6. Milestone status: complete, partial, or blocked, supported by evidence.
Keep the product description honest: live 3D garment preview. Size accuracy, realistic cloth fit, complete original-clothing removal, and full rotation support each require separate evidence.

After this milestone, proceed according to the next authorized task: camera calibration, garment geometry/weights, then coverage and occlusion.