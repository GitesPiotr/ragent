import { redirect } from "next/navigation";

// Wejscie do aplikacji prowadzi na liste projektow.
// Kreator agenta otwiera sie dla konkretnego agenta:
//   /projekty/[projectId]/agenty/[agentId]
export default function Home() {
  redirect("/projekty");
}
