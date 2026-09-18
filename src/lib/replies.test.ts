import { expect, it } from "vitest";
import { buildStudyPackConfirmation } from "./replies";
import type { StudyPack } from "./types";
const empty: StudyPack = { clean_notes: "", reviewer: "", summary: "", story: "", flashcards: [], quiz: [] };
it("never claims sections were created when all generation failed", () => {
 const text = buildStudyPackConfirmation("Plants", empty);
 expect(text).toContain("couldn't build"); expect(text).not.toContain("✓");
});
it("lists only actual sections and does not promise selective retries", () => {
 const text = buildStudyPackConfirmation("Plants", { ...empty, summary: "A plant summary." });
 expect(text).toContain("✓ Summary"); expect(text).toContain("✗ Flashcards");
 expect(text).not.toContain("✓ Flashcards"); expect(text).not.toContain("rebuild just those");
});
it("lists all six sections only for a complete pack", () => {
 const text = buildStudyPackConfirmation("Plants", { clean_notes: "Notes", reviewer: "Review", summary: "Summary", story: "Story", flashcards: [{front:"Q",back:"A"}], quiz: [{question:"Q",choices:["A"],answer:"0",explanation:"E"}] });
 expect(text.match(/✓/g)).toHaveLength(6); expect(text).not.toContain("✗");
});
