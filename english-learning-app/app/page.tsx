import { dbExists, getVocabulary, getPhrases } from "./lib/db";
import { vocabulary as staticVocab, phrases as staticPhrases } from "./data/vocabulary";
import AppClient from "./components/AppClient";

export default function Home() {
  // DBにデータがあればDB優先、なければ静的データを使用
  const useDb      = dbExists();
  const vocabulary = useDb ? getVocabulary() : staticVocab;
  const phrases    = useDb ? getPhrases()    : staticPhrases;

  // DBのフレーズが空の場合は静的データで補完
  const finalPhrases = phrases.length > 0 ? phrases : staticPhrases;

  return (
    <AppClient
      vocabulary={vocabulary}
      phrases={finalPhrases}
      dataSource={useDb ? "db" : "static"}
    />
  );
}
