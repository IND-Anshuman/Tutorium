"use client";

import type { InteractivePayload } from "@/lib/types";
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

interface Props {
  payload: InteractivePayload;
  onSayItBackRecord?: (payload: InteractivePayload & { type: "say_it_back" }) => void;
}

export default function InteractiveMessage({ payload, onSayItBackRecord }: Props) {
  switch (payload.type) {
    case "flashcards":
      return <FlashcardDeck cards={payload.cards} />;
    case "quiz":
      return <MiniQuiz questions={payload.questions} topicId={payload.topicId} />;
    case "info_cards":
      return <InfoCards cards={payload.cards} />;
    case "comparison_table":
      return <ComparisonTable headers={payload.headers} rows={payload.rows} />;
    case "html_visual":
      return <HtmlVisual title={payload.title} html={payload.html} />;
    case "study_pack_actions":
      return <StudyPackActions topic={payload.topic} topicId={payload.topicId} actions={payload.actions} />;
    case "say_it_back":
      return <SayItBackCard payload={payload} onRecord={onSayItBackRecord} />;
    case "heatmap":
      return <Heatmap words={(payload as any).words || []} overall={(payload as any).overall ?? 0} />;
    case "teach_back":
      return <TeachBackCard payload={payload as any} />;
    case "vocab_preview":
      return <VocabPreview terms={(payload as any).terms || []} />;
    default:
      return null;
  }
}