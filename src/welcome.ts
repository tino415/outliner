import { Doc, ROOT, setFlags, setText } from "./model";
import { parseIndentedText } from "./transfer";
import { keyNames } from "./platform";

const WELCOME = `
Welcome to your outline
  Everything lives in this browser. Nothing is sent anywhere.
  Click any text and start typing. Press **Enter** for a new item.
  Press **Tab** to indent, **Shift Tab** to outdent
    Indented items can be folded away
      As deep as you like
  Click a bullet to *zoom* into it. The breadcrumbs above lead back out.
  **Ctrl Enter** completes an item
  Backspace at the start of an item joins it with the one above
  Search with **/** or Ctrl F, or click a tag like #ideas
  **Ctrl K** jumps to any item by name
  Press **?** for every shortcut
  Write calories:: 350 or effort:: 2h in a note, then ⋯ → Columns adds them up on every parent
  Ready to start? The ⋯ menu has **Clear this page**
Things to try
  Plan the week #planning
    Monday: write the draft
    Tuesday: review with the team
    Wednesday: ship it
  Reading list #ideas
    The Mythical Man-Month
    A Pattern Language
    https://www.inkandswitch.com/local-first/
  Groceries
    Coffee beans
    Oat milk
    Bread
Install it
  On a phone: Share, then Add to Home Screen
  On a phone, swipe an item right to complete it, left to fold it
  On a desktop: the install icon in the address bar
  It keeps working offline
`;

export function welcomeDoc(): Doc {
  let doc = parseIndentedText(keyNames(WELCOME));
  doc = setText(doc, ROOT, "Home");
  const items = Object.values(doc.items);
  const byText = (text: string) => items.find((item) => item.text === text)!;
  doc = setFlags(doc, byText("Bread").id, { completed: true });
  doc = setFlags(doc, byText("Indented items can be folded away").id, { collapsed: true });
  doc = setFlags(doc, byText("Groceries").id, { collapsed: true });
  doc = setFlags(doc, byText("Plan the week #planning").id, {
    note: keyNames("Notes sit under an item. Shift Enter opens one."),
  });
  return doc;
}
