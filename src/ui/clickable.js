// The four attributes a non-button element needs before a keyboard can use it.
//
// The app had 87 clickable <div>s with no role and no tabIndex — booth rows, vendor directory
// lines, store shelves, inbox entries. A mouse could use all of them and a keyboard could reach
// none, which also meant the global :focus-visible ring had nothing to paint on: the ring and the
// tab stop are the same fix, and neither works alone.
//
// The idiom itself is not new — Collapse, PackOpening, StoreStock and a handful of others already
// spelled it out by hand. Ten call sites had it right and seventy-seven did not, which is what a
// copied idiom always converges to. This is that idiom, once.
//
//   <div {...clickable(() => openBooth(b))} className="vendoritem"> … </div>
//
// Space is preventDefault-ed because a focused element's default Space action is to scroll the
// page, and a row that both activates AND jumps the viewport reads as broken.
//
// DO NOT use this for a modal backdrop or a decorative wrapper that forwards a click to a child.
// A backdrop is dismissed with Escape (Modal.jsx binds it); making it a tab stop puts a
// meaningless stop in front of every dialog. If it should not be in the tab order, it should not
// have a role either — leave those alone.
//
// Prefer a real <button> when the styling allows it. This is for the cases where it does not:
// grid/flex children whose layout a button would break, and elements that already carry their own
// nested buttons (a <button> inside a <button> is invalid HTML).
export function clickable(onActivate, extra = {}) {
  return {
    role: 'button',
    tabIndex: 0,
    onClick: onActivate,
    onKeyDown: e => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onActivate(e) }
    },
    ...extra,
  }
}
