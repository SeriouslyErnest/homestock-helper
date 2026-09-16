# Barcode quantity controls and mobile inventory layout

## What will change

- On the add-item screen reached after scanning or typing a barcode, replace the separate Quantity and Unit fields with a compact quantity stepper: a large minus button, a small editable number field, and a large plus button.
- Keep manual quantities supported, prevent values below zero, and continue saving the default unit internally so existing inventory records remain compatible.
- Keep known-barcode behavior unchanged: scanning an item already at home opens its item page, where the existing quick quantity controls remain available.
- Rework inventory list rows for narrow phones so product details and quantity controls have stable space, long names truncate cleanly, and controls no longer push the page or bottom menu off-center.
- Tighten the inventory heading/view-control row and search row with shrink-safe responsive layout rules.

## Validation

- Check scanned/manual add flows with whole and custom quantities.
- Review Inventory in list and card modes at narrow mobile width and desktop width.
- Confirm long product names, locations, status labels, and navigation stay aligned without horizontal overflow.

## Technical details

- Preserve the existing database shape by saving `pcs` as the default unit; this change only simplifies the add-item interface.
- Use the current HomeStock colours, typography, controls, and accessibility labels.
- Verify the relevant files and run focused checks after implementation.
