import type { ApiResponse } from "@qavibe/shared-types";

export default function Home() {
  const response: ApiResponse<string> = {
    data: "QAVibe is running",
    success: true,
  };

  return (
    <main>
      <h1>QAVibe</h1>
      <p>{response.data}</p>
    </main>
  );
}
