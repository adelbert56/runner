# Runner Plaza UI system

## Purpose

The local registration manager is a compact operational workspace: users should see the next task, the selected race context, and one clear action before they see secondary tools. It is not a marketing dashboard.

## Protected behaviour

- Keep `/api/registration-data` and batch Excel endpoints, local-only access, backup/restore, validation, exports, hashes, and local preferences unchanged.
- Keep existing data fields, permissions, keyboard form behaviour, confirmations, and status messages unchanged.
- UI changes may improve grouping, labels, semantics, focus treatment, and responsive presentation only.

## Layout and density

- Desktop: a quiet race-context rail plus one primary work surface. The current workspace owns the page; forms support lists instead of competing with them.
- Tablet: stack the rail before the work surface; sticky panels become ordinary panels.
- Mobile (760px and below): keep task order, use a two-column metric strip, and allow workspace tabs to scroll horizontally rather than compressing labels.
- Spacing rhythm: 8 / 12 / 16 / 24 / 32px. Use 16px for panel padding on small viewports and 20px on desktop.

## Visual tokens

- Surfaces: neutral canvas, white work surfaces, and a faint green task surface only for active context.
- Roles: green for primary action and selected state; amber for pending work; red only for destructive or overdue money state.
- Borders and elevation: one neutral border and low elevation. Avoid nested shadows and decorative gradients.
- Type: 28/36 page title, 20/28 workspace title, 14/20 body, 12/16 labels. Numbers can be larger only in summary metrics.

## Primitives

| Primitive | Rule |
| --- | --- |
| Actions | One primary action per local group; secondary actions are outlined; destructive actions stay text-red until their existing confirmation. |
| Metrics | One grouped strip with label, value, and a short explanation. Only pending and unpaid states receive colour emphasis. |
| Filters | Search first, common filters next, advanced filters in `details`; show the reset action only when it has work to do. |
| Data display | Lists are the primary reading surface. Use grouped rows/tables for records and compact metadata pills for race context. |
| Forms | Forms use a quiet support surface and collapsible advanced fields; do not change validation or submission behaviour. |
| Feedback | Loading, empty, error, and success states use one status treatment and state the next safe action when one exists. |
| Overlays | Keep existing `details` and confirmation flows. New overlays must retain focus and Escape behaviour. |

## Navigation and accessibility

- Workspace navigation uses `tablist`, `tab`, and `tabpanel`; selected state is exposed with `aria-selected` and Arrow/Home/End navigation.
- Every interactive control receives the same visible focus ring. Do not rely on colour alone for status.
- Touch targets are at least 40px; mobile keeps labels readable rather than turning actions into unlabeled icons.

## Extension log

| Date | Change | Screens | Deprecated pattern |
| --- | --- | --- | --- |
| 2026-07-24 | Registration workspace system | Overview, people, entries, notifications, data tools | Screen-specific card shadows, competing hero treatment, repeated breakpoint overrides |
