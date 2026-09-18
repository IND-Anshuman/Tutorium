"use client";

import type {
  InteractivePayload,
  InteractiveHeatmap,
  InteractiveVocabPreview,
  InteractiveTeachBack,
} from "@/lib/types";
import FlashcardDeck from "./FlashcardDeck";
import MiniQuiz from "./MiniQuiz";
import InfoCards from "./InfoCards";
import ComparisonTable from "./ComparisonTable";
import HtmlVisual from "./HtmlVisual";
import StudyPackActions from "./StudyPackActions";
import SayItBackCard from "./SayItBackCard";
import Heatmap from "./Heatmap";
import TeachBackCard from "./TeachBackCard";
import VocabPreview from "./VocabPreview";
import DocumentCard from "./DocumentCard";

interface Props {
  payload: InteractivePayload;
  onSayItBackRecord?: (payload: InteractivePayload & { type: "say_it_back" }) => void;
}

export default function InteractiveMessage({ payload, onSayItBackRecord }: Props) {
  switch (payload.type) {
    case "flashcards":
      return <FlashcardDeck cards={payload.cards} theme={payload.theme ?? undefined} />;
    case "quiz":
      return <MiniQuiz questions={payload.questions} topicId={payload.topicId} theme={payload.theme ?? undefined} />;
    case "document":
      return <DocumentCard payload={payload} />;
    case "info_cards":
      return <InfoCards items={payload.cards} topic={payload.topic} />;
    case "comparison_table":
      return <ComparisonTable
        headers={payload.headers || ["A", "B"]}
        rows={payload.rows || []}
        topic={payload.topic}
      />;
    case "html_visual":
      return <HtmlVisual title={payload.title} html={payload.html} />;
    case "study_pack_actions":
      return <StudyPackActions topic={payload.topic} topicId={payload.topicId} actions={payload.actions} />;
    case "say_it_back":
      return <SayItBackCard payload={payload} onRecord={onSayItBackRecord} />;
    case "heatmap":
      return <Heatmap {...payload} />;
    case "teach_back":
      return <TeachBackCard payload={payload} />;
    case "vocab_preview":
      return <VocabPreview topic={payload.topic} terms={payload.terms} />;
    default:
      return null;
  }
}

// Re-exporting the types so page.tsx can construct these payloads without casts.
export type { InteractiveHeatmap, InteractiveVocabPreview, InteractiveTeachBack };