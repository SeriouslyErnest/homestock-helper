# Full-screen product photos and adaptive scanner

## What will change

- Add one reusable full-screen photo viewer for product pictures, with a clear close control, backdrop tap, and Escape-key support.
- Make available product pictures tappable from inventory, item details, quick-use, add-item preview, and linked shopping-list entries.
- Keep non-picture category icons unchanged and make picture buttons clearly accessible without interfering with item links or quantity controls.
- Let long item names wrap instead of cutting off important product details in Shopping and the picture-bearing Inventory views, while keeping compact view intentionally compact.
- Reduce the barcode camera area by roughly one quarter and cap it against the available screen height, so the status, manual entry, and add-without-barcode controls fit more often without scrolling.

## Validation

- Open and close product photos from Inventory, Shopping, item details, quick-use, and add-item screens.
- Confirm shopping requests without a linked inventory picture remain unchanged.
- Check long product names at narrow phone and desktop widths without horizontal overflow.
- Check the scan screen at short and tall phone sizes, including camera-unavailable messaging and all lower controls.

## Technical details

- The photo viewer will be a small shared dialog using the existing HomeStock colour tokens and controls.
- Shopping pictures will come from the linked inventory item already loaded on that screen; no database changes are needed.
- The scanner will use responsive aspect ratio and viewport-height limits rather than targeting a specific phone model.
