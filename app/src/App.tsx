import { InterviewApp } from "./ui/InterviewApp";
import { lazy, Suspense } from "react";

const Preview = import.meta.env.DEV ? lazy(() => import("./ui/RoomPreview")) : null;

function App() {
  if (Preview && new URLSearchParams(window.location.search).get("preview") === "room") {
    return <Suspense fallback={<p>Opening preview…</p>}><Preview /></Suspense>;
  }
  return <InterviewApp />;
}

export default App;
