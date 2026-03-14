import { useQuery, useMutation } from "@tanstack/react-query";
import { useParams, useLocation } from "wouter";
import { useState, useRef, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Mic, MicOff, Send, Bug, SkipForward, FileText, MessageSquare,
  AlertCircle, CheckCircle2, XCircle, Clock, Volume2
} from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { Session, TestMap, TestArea, SessionLogEntry } from "@/lib/types";

export default function Test() {
  const params = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const [inputText, setInputText] = useState("");
  const [isListening, setIsListening] = useState(false);
  const [interimText, setInterimText] = useState("");
  const [nudgeText, setNudgeText] = useState("");
  const [bugMode, setBugMode] = useState(false);
  const [bugSeverity, setBugSeverity] = useState<string>("major");
  const logEndRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<any>(null);

  const { data: session } = useQuery<Session>({
    queryKey: ["/api/sessions", params.id],
  });

  const { data: logs, refetch: refetchLogs } = useQuery<SessionLogEntry[]>({
    queryKey: ["/api/sessions", params.id, "log"],
  });

  const testMap: TestMap | null = session?.testMap ? JSON.parse(session.testMap) : null;

  const allAreas = testMap
    ? [...testMap.happy_paths, ...testMap.edge_cases, ...testMap.negative_flows, ...testMap.integration_risks]
    : [];

  const coveredAreas = new Set(
    (logs || []).filter((l) => l.mappedArea).map((l) => l.mappedArea)
  );
  const coveragePct = allAreas.length > 0 ? Math.round((coveredAreas.size / allAreas.length) * 100) : 0;
  const bugsCount = (logs || []).filter((l) => l.type === "bug").length;

  // Auto-scroll log
  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  // Web Speech API
  const startListening = useCallback(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) return;

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";

    recognition.onresult = (event: any) => {
      let interim = "";
      let final = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          final += transcript;
        } else {
          interim += transcript;
        }
      }
      setInterimText(interim);
      if (final) {
        setInputText((prev) => (prev ? prev + " " + final : final));
        setInterimText("");
      }
    };

    recognition.onerror = () => {
      setIsListening(false);
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    recognitionRef.current = recognition;
    recognition.start();
    setIsListening(true);
  }, []);

  const stopListening = useCallback(() => {
    recognitionRef.current?.stop();
    setIsListening(false);
    setInterimText("");
  }, []);

  // Submit an utterance
  const submitEntry = useMutation({
    mutationFn: async ({ type, content, severity }: { type: string; content: string; severity?: string }) => {
      // First log the entry
      await apiRequest("POST", `/api/sessions/${params.id}/log`, {
        type,
        content,
        severity: severity || null,
      });

      // Then get AI nudge
      if (type === "utterance" || type === "bug") {
        const nudgeRes = await apiRequest("POST", "/api/ai/nudge", {
          sessionId: params.id,
          utterance: content,
        });
        const nudgeData = await nudgeRes.json();

        // Log the nudge
        await apiRequest("POST", `/api/sessions/${params.id}/log`, {
          type: "nudge",
          content: nudgeData.nudge,
          mappedArea: nudgeData.mappedArea,
        });

        // Update mapped area on original entry
        if (nudgeData.mappedArea) {
          // The log entry was already submitted, area mapping happens on nudge
        }

        return nudgeData;
      }
      return null;
    },
    onSuccess: (data) => {
      if (data?.nudge) {
        setNudgeText(data.nudge);
        // Text-to-speech for nudge
        if ("speechSynthesis" in window) {
          const utter = new SpeechSynthesisUtterance(data.nudge);
          utter.rate = 1.1;
          utter.pitch = 1;
          window.speechSynthesis.speak(utter);
        }
      }
      refetchLogs();
      queryClient.invalidateQueries({ queryKey: ["/api/sessions", params.id] });
    },
  });

  const handleSubmit = () => {
    const text = inputText.trim();
    if (!text) return;

    if (bugMode) {
      submitEntry.mutate({ type: "bug", content: text, severity: bugSeverity });
      setBugMode(false);
    } else {
      submitEntry.mutate({ type: "utterance", content: text });
    }
    setInputText("");
  };

  const handleSkip = () => {
    const text = inputText.trim() || "Skipping current area";
    submitEntry.mutate({ type: "skip", content: text });
    setInputText("");
  };

  const generateSummary = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/ai/summary", { sessionId: params.id });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/sessions", params.id] });
      navigate(`/session/${params.id}/report`);
    },
  });

  const logTypeConfig: Record<string, { icon: any; color: string }> = {
    utterance: { icon: MessageSquare, color: "text-foreground" },
    bug: { icon: Bug, color: "text-red-500 dark:text-red-400" },
    skip: { icon: SkipForward, color: "text-amber-500 dark:text-amber-400" },
    nudge: { icon: Volume2, color: "text-primary" },
    note: { icon: FileText, color: "text-muted-foreground" },
  };

  if (!session) return null;

  return (
    <div className="space-y-4">
      {/* Header bar */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <div className="flex items-center gap-2 mb-0.5">
            <span className="font-mono text-sm text-muted-foreground">{session.ticketId}</span>
            <Badge variant="default" className="text-[10px] h-5">Stage 2: Test</Badge>
          </div>
          <h1 className="text-lg font-semibold tracking-tight" data-testid="text-test-title">
            {session.ticketTitle || "Testing Session"}
          </h1>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => generateSummary.mutate()}
          disabled={generateSummary.isPending}
          className="gap-1.5"
          data-testid="button-end-session"
        >
          {generateSummary.isPending ? (
            <>
              <Clock className="w-3.5 h-3.5 animate-spin" />
              Generating...
            </>
          ) : (
            <>
              <FileText className="w-3.5 h-3.5" />
              End Session
            </>
          )}
        </Button>
      </div>

      {/* Coverage + stats */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Coverage bar */}
        <Card className="lg:col-span-2">
          <CardContent className="py-4 px-5">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium">Coverage</span>
              <span className="text-sm font-mono font-semibold" data-testid="text-coverage-pct">
                {coveragePct}%
              </span>
            </div>
            <Progress value={coveragePct} className="h-2" />
            <div className="flex gap-4 mt-3 text-xs text-muted-foreground">
              <span>{coveredAreas.size} of {allAreas.length} areas covered</span>
              <span>•</span>
              <span>{bugsCount} bug{bugsCount !== 1 ? "s" : ""} found</span>
              <span>•</span>
              <span>{(logs || []).filter(l => l.type === "utterance").length} actions logged</span>
            </div>
          </CardContent>
        </Card>

        {/* Area coverage breakdown */}
        <Card>
          <CardContent className="py-4 px-5">
            <span className="text-sm font-medium mb-2 block">Test Areas</span>
            <div className="space-y-1.5">
              {allAreas.slice(0, 6).map((area, i) => {
                const isCovered = coveredAreas.has(area.area);
                return (
                  <div key={i} className="flex items-center gap-2 text-xs">
                    {isCovered ? (
                      <CheckCircle2 className="w-3 h-3 text-emerald-500 shrink-0" />
                    ) : (
                      <XCircle className="w-3 h-3 text-muted-foreground/40 shrink-0" />
                    )}
                    <span className={isCovered ? "text-foreground" : "text-muted-foreground"}>
                      {area.area}
                    </span>
                  </div>
                );
              })}
              {allAreas.length > 6 && (
                <span className="text-[10px] text-muted-foreground">
                  +{allAreas.length - 6} more
                </span>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main session area */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Session log */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-sm font-medium">Session Log</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <ScrollArea className="h-[360px] pr-2">
              <div className="space-y-2">
                {(!logs || logs.length === 0) && (
                  <div className="text-sm text-muted-foreground text-center py-8">
                    Start speaking or typing to log your testing activity.
                  </div>
                )}
                {(logs || []).map((entry) => {
                  const config = logTypeConfig[entry.type] || logTypeConfig.note;
                  const Icon = config.icon;
                  return (
                    <div
                      key={entry.id}
                      className={`flex gap-3 p-2.5 rounded-md ${
                        entry.type === "nudge"
                          ? "bg-primary/5 border border-primary/10"
                          : entry.type === "bug"
                          ? "bg-red-500/5 border border-red-500/10"
                          : "bg-muted/30"
                      }`}
                      data-testid={`log-entry-${entry.id}`}
                    >
                      <div className="mt-0.5">
                        <Icon className={`w-3.5 h-3.5 ${config.color}`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className="text-[10px] font-mono text-muted-foreground uppercase">
                            {entry.type}
                          </span>
                          {entry.severity && (
                            <Badge
                              variant={entry.severity === "critical" ? "destructive" : "outline"}
                              className="text-[9px] h-4"
                            >
                              {entry.severity}
                            </Badge>
                          )}
                          {entry.mappedArea && (
                            <Badge variant="secondary" className="text-[9px] h-4">
                              {entry.mappedArea}
                            </Badge>
                          )}
                        </div>
                        <p className="text-sm">{entry.content}</p>
                      </div>
                      <span className="text-[10px] text-muted-foreground shrink-0 mt-0.5">
                        {new Date(entry.timestamp * 1000).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    </div>
                  );
                })}
                <div ref={logEndRef} />
              </div>
            </ScrollArea>

            <Separator className="my-3" />

            {/* Nudge display */}
            {nudgeText && (
              <div className="flex items-start gap-2 p-2.5 rounded-md bg-primary/5 border border-primary/10 mb-3">
                <Volume2 className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                <p className="text-sm text-primary">{nudgeText}</p>
              </div>
            )}

            {/* Input area */}
            <div className="space-y-2">
              {bugMode && (
                <div className="flex items-center gap-2">
                  <Bug className="w-4 h-4 text-red-500" />
                  <span className="text-xs font-medium text-red-500">Bug Report Mode</span>
                  <Select value={bugSeverity} onValueChange={setBugSeverity}>
                    <SelectTrigger className="w-28 h-7 text-xs" data-testid="select-severity">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="critical">Critical</SelectItem>
                      <SelectItem value="major">Major</SelectItem>
                      <SelectItem value="minor">Minor</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button variant="ghost" size="sm" className="text-xs h-7" onClick={() => setBugMode(false)}>
                    Cancel
                  </Button>
                </div>
              )}

              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Input
                    value={inputText}
                    onChange={(e) => setInputText(e.target.value)}
                    placeholder={
                      bugMode
                        ? "Describe the bug..."
                        : isListening
                        ? "Listening..."
                        : "Describe what you're testing..."
                    }
                    onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
                    className={bugMode ? "border-red-500/30 focus-visible:ring-red-500/30" : ""}
                    data-testid="input-test-message"
                  />
                  {interimText && (
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground italic">
                      {interimText}
                    </span>
                  )}
                </div>

                <Button
                  variant={isListening ? "destructive" : "outline"}
                  size="icon"
                  onClick={isListening ? stopListening : startListening}
                  data-testid="button-mic"
                  title={isListening ? "Stop listening" : "Start voice input"}
                >
                  {isListening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                </Button>

                <Button
                  size="icon"
                  onClick={handleSubmit}
                  disabled={!inputText.trim() || submitEntry.isPending}
                  data-testid="button-send"
                >
                  <Send className="w-4 h-4" />
                </Button>
              </div>

              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="text-xs gap-1"
                  onClick={() => setBugMode(true)}
                  data-testid="button-log-bug"
                >
                  <Bug className="w-3 h-3" />
                  Log Bug
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="text-xs gap-1"
                  onClick={handleSkip}
                  data-testid="button-skip"
                >
                  <SkipForward className="w-3 h-3" />
                  Skip Area
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Test plan reference */}
        <Card>
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-sm font-medium">Test Plan Reference</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <ScrollArea className="h-[460px]">
              <div className="space-y-4">
                {testMap && (
                  <>
                    <PlanSection title="Happy Paths" areas={testMap.happy_paths} coveredAreas={coveredAreas} />
                    <PlanSection title="Edge Cases" areas={testMap.edge_cases} coveredAreas={coveredAreas} />
                    <PlanSection title="Negative Flows" areas={testMap.negative_flows} coveredAreas={coveredAreas} />
                    <PlanSection title="Integration Risks" areas={testMap.integration_risks} coveredAreas={coveredAreas} />
                  </>
                )}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function PlanSection({
  title,
  areas,
  coveredAreas,
}: {
  title: string;
  areas: TestArea[];
  coveredAreas: Set<string | null>;
}) {
  const riskColors = {
    high: "text-red-500",
    medium: "text-amber-500",
    low: "text-emerald-500",
  };

  return (
    <div>
      <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
        {title}
      </h4>
      <div className="space-y-1">
        {areas.map((area, i) => {
          const isCovered = coveredAreas.has(area.area);
          return (
            <div
              key={i}
              className={`flex items-start gap-2 p-2 rounded text-xs ${
                isCovered ? "bg-emerald-500/5" : "bg-muted/20"
              }`}
            >
              {isCovered ? (
                <CheckCircle2 className="w-3 h-3 text-emerald-500 mt-0.5 shrink-0" />
              ) : (
                <AlertCircle className={`w-3 h-3 ${riskColors[area.risk]} mt-0.5 shrink-0`} />
              )}
              <div className="min-w-0">
                <span className="font-medium">{area.area}</span>
                <p className="text-muted-foreground mt-0.5">{area.scenario}</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
