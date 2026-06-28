"use client";
import { useState } from "react";
import ModeSelect      from "./ModeSelect";
import EikaiwaMode     from "./EikaiwaMode";
import TOEICMode       from "./TOEICMode";
import DictionaryMode  from "./DictionaryMode";
import type { Word, Phrase } from "../data/vocabulary";
import { useReviewList }   from "../hooks/useReviewList";
import { useStudyHistory } from "../hooks/useStudyHistory";
import { useWrongWords }   from "../hooks/useWrongWords";

type AppMode = "select" | "eikaiwa" | "toeic" | "dictionary";

interface Props {
  vocabulary:  Word[];
  phrases:     Phrase[];
  dataSource?: "db" | "static";
}

export default function AppClient({ vocabulary, phrases }: Props) {
  const [mode, setMode] = useState<AppMode>("select");

  const { items, toggle, remove, isInList } = useReviewList();
  const { history, addRecord, addWordsStudied } = useStudyHistory();
  const { wrongIds, addWrong, removeWrong, clearWrong } = useWrongWords();

  if (mode === "select") {
    return <ModeSelect onSelect={(m) => setMode(m)} />;
  }

  if (mode === "dictionary") {
    return (
      <DictionaryMode
        vocabulary={vocabulary}
        isInList={isInList}
        onToggle={toggle}
        onBack={() => setMode("select")}
      />
    );
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
        wrongIds={wrongIds}
        onWrong={addWrong}
        onRemoveWrong={removeWrong}
        onClearWrong={clearWrong}
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
      wrongIds={wrongIds}
      onWrong={addWrong}
      onRemoveWrong={removeWrong}
      onClearWrong={clearWrong}
      onBack={() => setMode("select")}
    />
  );
}
