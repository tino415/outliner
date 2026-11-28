import { escape } from "./inline";
import { Doc, ItemId, setFlags } from "./model";
import { onlyReference, referenceTo } from "./references";
import { graft, parseIndentedText } from "./transfer";

/*
 * The formula reference shown in the app (⋯ → Formula help), and example
 * pages it can add to the outline. tests/formula.test.ts computes every
 * example, so the help cannot promise what the formulas do not do.
 */

export interface FormulaExample {
  title: string;
  explanation: string;
  outline: string;
}

export const FORMULA_EXAMPLES: FormulaExample[] = [
  {
    title: "A day as a timetable",
    explanation: "Each item starts when the ones above it are done, counted from the day's start; end adds its own effort.",
    outline: [
      "- Example: Monday",
      "  :start: 9:00",
      "  :columns: effort start{=clock(parent.start + before(effort))} end{=start + effort}",
      "  - Standup",
      "    :effort: 15m",
      "  - Deep work",
      "    :effort: 2h",
      "  - Lunch",
      "    :effort: 1h",
    ].join("\n"),
  },
  {
    title: "Calories and their share of the day",
    explanation: "kcal adds up on every parent; share is each meal's part of its day, in percent.",
    outline: [
      "- Example: Food",
      "  :columns: kcal share{=kcal / parent.kcal * 100}",
      "  - Breakfast",
      "    :kcal: 450 kcal",
      "  - Lunch",
      "    :kcal: 700 kcal",
      "  - Dinner",
      "    :kcal: 650 kcal",
    ].join("\n"),
  },
  {
    title: "Time left in a working day",
    explanation: "left is what remains of 8 hours after this item and the ones above it.",
    outline: [
      "- Example: Work",
      "  :columns: effort left{=8h - before(effort) - effort}",
      "  - Review",
      "    :effort: 1h30m",
      "  - Write the report",
      "    :effort: 3h",
      "  - Email",
      "    :effort: 45m",
    ].join("\n"),
  },
  {
    title: "Portions that follow their ingredient",
    explanation: "An ingredient holds its kcal for 100 grams; a portion links it in food and gives its own grams, a half portion links the portion.",
    outline: [
      "- Example: Portions",
      "  :columns: grams kcal{=grams * food.kcal / food.grams}",
      "  - Example oats",
      "    :kcal: 379",
      "    :grams: 100",
      "  - Example porridge",
      "    :food: [[Example oats]]",
      "    :grams: 60",
      "  - Example half porridge",
      "    :food: [[Example porridge]]",
      "    :grams: 30",
    ].join("\n"),
  },
  {
    title: "Calories of a recipe",
    explanation: "kcal comes from grams and per100; a typed kcal stays; every parent adds up its children, in whole numbers.",
    outline: [
      "- Example: Recipe",
      "  :columns: grams kcal{sum round = grams * per100 / 100}",
      "  - Dough",
      "    - Flour",
      "      :grams: 250",
      "      :per100: 364",
      "    - Butter",
      "      :grams: 125",
      "      :per100: 717",
      "  - Filling",
      "    - Apples",
      "      :grams: 600",
      "      :per100: 52",
      "    - Sugar",
      "      :kcal: 200",
    ].join("\n"),
  },
];

const REFERENCE: [string, [string, string][]][] = [
  [
    "Where formulas go",
    [
      [":columns: effort start{=…}", "On a page: a column computed for every row below it that has no value of its own"],
      [":start: 14:00", "A row's own value wins over the formula"],
      [":effort: =24:00 - start", "A value starting with = is a formula of that item's own, here the rest of the day"],
      [":columns: kcal{sum = …}", "A summary word before the =: a parent shows the sum of its children; also min, max, mean"],
      [":columns: kcal{sum round = …}", "round shows computed values and sums as whole numbers"],
      ["error", "A formula that cannot be computed; hover the cell for the reason"],
    ],
  ],
  [
    "Values",
    [
      ["effort", "This row's effort"],
      ["parent.start", "The parent's start"],
      ["previous.end", "The end of the row just above, under the same parent"],
      ["food.kcal", "The kcal of the item this row's food links"],
      ["time-spent", "A hyphen before a letter is part of the name; effort - 15m subtracts"],
    ],
  ],
  [
    "Functions",
    [
      ["before(effort)", "The sum of effort over the rows above, under the same parent; 0 for the first"],
      ["sum(kcal)", "The sum over the children; also min, max, mean"],
      ["clock(…)", "Show a duration as a time of day"],
    ],
  ],
  [
    "Amounts",
    [
      ["350 kcal, 12 g, 1,200", "Numbers with a unit; numbers in different units do not add"],
      ["1h30m, 90m, 1.5h, 2d", "Durations"],
      ["9:00", "A time of day: a time plus a duration is a time, a time minus a time a duration"],
      ["+ - * / ( )", "Arithmetic"],
    ],
  ],
];

export function withExampleLinkingItsOwnItems(doc: Doc, example: FormulaExample, parent: ItemId, index: number): { doc: Doc; page: ItemId } {
  const grafted = graft(doc, parseIndentedText(example.outline), parent, index);
  const page = grafted.ids[0];
  const own = itemsFrom(grafted.doc, page);
  const byText = new Map(own.map((id) => [comparable(grafted.doc.items[id].text), id]));
  const linkedById = (value: string): string => {
    const reference = onlyReference(value);
    const target = reference && byText.get(comparable(reference.target));
    return target ? referenceTo(target, grafted.doc.items[target].text) : value;
  };
  const result = own.reduce((result, id) => {
    const properties = Object.fromEntries(Object.entries(result.items[id].properties).map(([key, value]) => [key, linkedById(value)]));
    return setFlags(result, id, { properties });
  }, grafted.doc);
  return { doc: result, page };
}

function comparable(text: string): string {
  return text.trim().toLowerCase();
}

function itemsFrom(doc: Doc, top: ItemId): ItemId[] {
  return [top, ...doc.items[top].children.flatMap((child) => itemsFrom(doc, child))];
}

export function formulaHelpHtml(): string {
  const sections = REFERENCE.map(
    ([heading, rows]) =>
      `<h3>${escape(heading)}</h3><dl class="formula-reference">${rows.map(([code, meaning]) => `<dt><code>${escape(code)}</code></dt><dd>${escape(meaning)}</dd>`).join("")}</dl>`,
  ).join("");
  const examples = FORMULA_EXAMPLES.map(
    (example, index) =>
      `<section class="formula-example"><h4>${escape(example.title)}</h4><p>${escape(example.explanation)}</p>` +
      `<pre>${escape(example.outline)}</pre><button type="button" class="link-button" data-formula-example="${index}">Add to this page</button></section>`,
  ).join("");
  return `${sections}<h3>Examples</h3>${examples}`;
}
