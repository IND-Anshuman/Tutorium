import { afterEach, beforeEach, expect, it, vi } from "vitest";

// Real worker -> orchestrator -> agents -> reply builder; only storage and LLM
// transport are substituted. No SQLite imports or network requests.
const state = vi.hoisted(() => ({
  status: "pending", result: null as any,
  messages: [] as any[], materials: [] as any[], llm: vi.fn(),
}));
vi.mock("./db", () => ({
  default: { prepare: () => ({ get: () => ["pending", "running"].includes(state.status) ? {id:"job"} : undefined }) },
  getJob: () => ({user_id:"fixture-user",payload:{topicId:"topic",sessionId:"session",topicTitle:"Plants",subjectName:"Science",message:"Plant notes",classification:{intent:"create_study_pack"}}}),
  setJobStatus: (_id: string, status: string, result: any) => {state.status=status;state.result=result;},
  getMaterial: () => null,
  saveMaterial: (topicId: string, type: string, title: string, content: any) => {state.materials.push({topicId,type,title,content});return `material-${state.materials.length}`;},
  saveMessage: (topicId: string, role: string, content: string, interactive: any, _audio: any, opts: any) => {state.messages.push({topicId,role,content,interactive,...opts});return "message";},
  asInteractive: (p: unknown) => p,
}));
vi.mock("./llm", () => ({llmJson: state.llm}));

beforeEach(() => {
  vi.resetModules();vi.useFakeTimers();state.status="pending";state.result=null;
  state.messages=[];state.materials=[];state.llm.mockReset();
  vi.stubGlobal("fetch", vi.fn(() => {throw new Error("Network forbidden in integration test");}));
  state.llm.mockImplementation(async ({system}: {system:string}) => {
    if(system.includes("Summarize the source")) return {data:{brief:"Plants use sunlight.",key_terms:["sunlight"]}};
    if(system.includes("study notes")) return {data:{clean_notes:"Notes"}};
    if(system.includes("recap materials")) return {data:{reviewer:"Review",summary:"Plants use sunlight."}};
    if(system.includes("assessment tools")) return {data:{flashcards:[{front:"Q",back:"A"}],quiz:[{question:"Q",choices:["A","B","C","D"],answer:"0",explanation:"E"}]}};
    if(system.includes("memorable story")) return {data:{story:"A plant story."}};
    throw new Error("Unexpected generation branch");
  });
});
afterEach(() => {vi.clearAllTimers();vi.useRealTimers();vi.unstubAllGlobals();});
async function run() {const {startJobRunner}=await import("./jobrunner");startJobRunner();await vi.advanceTimersByTimeAsync(1500);}

it("stores all sections and one session reply, identical to the polled result", async () => {
  await run();expect(state.status).toBe("done");expect(state.messages).toHaveLength(1);
  expect(state.messages[0]).toMatchObject({sessionId:"session",topicId:"topic",content:state.result.reply,interactive:state.result.interactive});
  expect(state.result.reply.match(/✓/g)).toHaveLength(6);
  expect(state.materials.map(m=>m.type)).toEqual(["brief","clean_notes","reviewer","flashcards","quiz","summary","story","sayitback"]);
  await vi.advanceTimersByTimeAsync(3000);expect(state.messages).toHaveLength(1);
});
it("keeps partial results and accurately reports unavailable assessment sections", async () => {
  const normal=state.llm.getMockImplementation()!;
  state.llm.mockImplementation(async (args: any) => {if(args.system.includes("assessment tools")) throw new Error("Fixture assessment outage");return normal(args);});
  await run();expect(state.status).toBe("done");expect(state.messages).toHaveLength(1);
  expect(state.result.reply).toContain("✗ Flashcards");expect(state.result.reply).not.toContain("✓ Flashcards");
  expect(state.materials.some(m=>m.type==="quiz")).toBe(false);
  expect(state.messages[0].content).toBe(state.result.reply);
});
it("brief failure leaves a persisted retry message, no fabricated materials or widget", async () => {
  state.llm.mockRejectedValue(new Error("Fixture brief outage"));
  await run();expect(state.messages).toHaveLength(1);expect(state.materials).toHaveLength(0);
  expect(state.messages[0]).toMatchObject({sessionId:"session",interactive:null});
  expect(state.messages[0].content).toContain("couldn't build");
  expect(state.result.reply).toBe(state.messages[0].content);
  expect(state.llm).toHaveBeenCalledTimes(1);
});
