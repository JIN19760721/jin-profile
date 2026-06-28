"use client";
import { useState } from "react";
import ModeSelect   from "./ModeSelect";
import EikaiwaMode  from "./EikaiwaMode";
import TOEICMode    from "./TOEICMode";
import type { Word, Phrase } from "../data/vocabulary";
import { useReviewList }   from "../hooks/useReviewList";
import { useStudyHistory } from "../hooks/useStudyHistory";

type AppMode = "select" | "eikaiwa" | "toeic";

interface Props {
  vocabulary:  Word[];
  phrases:     Phrase[];
  dataSource?: "db" | "static";
}

export default function AppClient({ vocabulary, phrases }: Props) {
  const [mode, setMode] = useState<AppMode>("select");

  const { items, toggle, remove, isInList } = useReviewList();
  const { history, addRecord, addWordsStudied } = useStudyHistory();

  if (mode === "select") {
    return <ModeSelect onSelect={(m) => setMode(m)} />;
  }

  if (mode === "eikaiwa") {
    return (
      <EikaiwaMode
        vocabulary={vocabulary}
        phrases={phrases}
        reviewItems={items}
        onToggle={toggle}
        onRemove={remove}
        isInList={isInList}
        history={history}
        onBack={() => setMode("select")}
      />
    );
  }

  return (
    <TOEICMode
      vocabulary={vocabulary}
      phrases={phrases}
      reviewItems={items}
      onToggle={toggle}
      onRemove={remove}
      isInList={isInList}
      history={history}
      addRecord={addRecord}
      onBack={() => setMode("select")}
    />
  );
}
