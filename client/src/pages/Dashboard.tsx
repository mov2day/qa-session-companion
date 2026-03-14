import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Plus, FlaskConical, Clock, CheckCircle2, AlertTriangle, ArrowRight, Loader2, Eye, EyeOff } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { Session } from "@/lib/types";

export default function Dashboard() {
  const [, navigate] = useLocation();
  const [open, setOpen] = useState(false);
  const [ticketId, setTicketId] = useState("");
  const [ticketTitle, setTicketTitle] = useState("");
  const [ticketDescription, setTicketDescription] = useState("");
  const [visibility, setVisibility] = useState("team");
  const [autoFetching, setAutoFetching] = useState(false);

  const { data: sessions, isLoading } = useQuery<Session[]>({
    queryKey: ["/api/sessions"],
  });

  const createSession = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/sessions", {
        ticketId: ticketId.trim(),
        ticketTitle: ticketTitle.trim() || null,
        ticketDescription: ticketDescription.trim() || null,
        visibility,
      });
      return res.json();
    },
    onSuccess: async (session: Session) => {
      // Auto-fetch context from integrations
      setAutoFetching(true);
      try {
        await apiRequest("POST", "/api/context/fetch", {
          sessionId: session.id,
          ticketId: session.ticketId,
        });
      } catch {
        // Non-blocking — context fetch failure doesn't block session creation
      }
      setAutoFetching(false);

      queryClient.invalidateQueries({ queryKey: ["/api/sessions"] });
      setOpen(false);
      setTicketId("");
      setTicketTitle("");
      setTicketDescription("");
      setVisibility("team");
      navigate(`/session/${session.id}/plan`);
    },
  });

  const statusConfig: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline"; icon: any }> = {
    planning: { label: "Planning", variant: "outline", icon: Clock },
    active: { label: "In Progress", variant: "default", icon: FlaskConical },
    complete: { label: "Complete", variant: "secondary", icon: CheckCircle2 },
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight" data-testid="page-title">
            QA Sessions
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            AI-powered test planning, execution, and reporting
          </p>
        </div>

        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-1.5" data-testid="button-new-session">
              <Plus className="w-3.5 h-3.5" />
              New Session
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Start a New QA Session</DialogTitle>
              <DialogDescription>
                Enter a ticket ID to auto-fetch context from Jira, GitHub, and Confluence.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <label className="text-sm font-medium">Ticket ID</label>
                <Input
                  placeholder="e.g. PROJ-123"
                  value={ticketId}
                  onChange={(e) => setTicketId(e.target.value)}
                  data-testid="input-ticket-id"
                />
                <p className="text-[11px] text-muted-foreground">
                  Context will be auto-fetched from configured integrations (Jira, GitHub, Confluence).
                </p>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Title (optional — auto-filled from Jira)</label>
                <Input
                  placeholder="e.g. Add password reset flow"
                  value={ticketTitle}
                  onChange={(e) => setTicketTitle(e.target.value)}
                  data-testid="input-ticket-title"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Description / Acceptance Criteria</label>
                <Textarea
                  placeholder="Paste the ticket description, acceptance criteria, or any relevant context..."
                  value={ticketDescription}
                  onChange={(e) => setTicketDescription(e.target.value)}
                  rows={4}
                  data-testid="input-ticket-description"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Visibility</label>
                <Select value={visibility} onValueChange={setVisibility}>
                  <SelectTrigger className="h-9" data-testid="select-visibility">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="team">
                      <span className="flex items-center gap-1.5">
                        <Eye className="w-3 h-3" /> Team (visible to all)
                      </span>
                    </SelectItem>
                    <SelectItem value="private">
                      <span className="flex items-center gap-1.5">
                        <EyeOff className="w-3 h-3" /> Private (only you)
                      </span>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button
                onClick={() => createSession.mutate()}
                disabled={!ticketId.trim() || createSession.isPending || autoFetching}
                data-testid="button-create-session"
              >
                {createSession.isPending || autoFetching ? (
                  <span className="flex items-center gap-1.5">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    {autoFetching ? "Fetching context..." : "Creating..."}
                  </span>
                ) : (
                  "Create Session"
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          title="Total Sessions"
          value={sessions?.length ?? 0}
          icon={FlaskConical}
          isLoading={isLoading}
        />
        <StatCard
          title="In Progress"
          value={sessions?.filter((s) => s.status === "active").length ?? 0}
          icon={Clock}
          isLoading={isLoading}
        />
        <StatCard
          title="Completed"
          value={sessions?.filter((s) => s.status === "complete").length ?? 0}
          icon={CheckCircle2}
          isLoading={isLoading}
        />
      </div>

      {/* Session list */}
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-20 w-full rounded-lg" />
          ))}
        </div>
      ) : sessions && sessions.length > 0 ? (
        <div className="space-y-3">
          {sessions.map((session) => {
            const config = statusConfig[session.status] || statusConfig.planning;
            const StatusIcon = config.icon;
            const route =
              session.status === "complete"
                ? `/session/${session.id}/report`
                : session.status === "active"
                ? `/session/${session.id}/test`
                : `/session/${session.id}/plan`;

            return (
              <Card
                key={session.id}
                className="cursor-pointer hover-elevate transition-colors"
                onClick={() => navigate(route)}
                data-testid={`card-session-${session.id}`}
              >
                <CardContent className="flex items-center justify-between py-4 px-5">
                  <div className="flex items-center gap-4 min-w-0">
                    <div className="w-9 h-9 rounded-md bg-muted flex items-center justify-center shrink-0">
                      <StatusIcon className="w-4 h-4 text-muted-foreground" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-sm font-medium" data-testid={`text-ticket-${session.id}`}>
                          {session.ticketId}
                        </span>
                        <Badge variant={config.variant} className="text-[10px] h-5">
                          {config.label}
                        </Badge>
                        {session.visibility === "private" && (
                          <EyeOff className="w-3 h-3 text-muted-foreground" />
                        )}
                      </div>
                      {session.ticketTitle && (
                        <p className="text-sm text-muted-foreground truncate mt-0.5">
                          {session.ticketTitle}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="text-xs text-muted-foreground hidden sm:block">
                      {new Date(session.createdAt * 1000).toLocaleDateString()}
                    </span>
                    <ArrowRight className="w-4 h-4 text-muted-foreground" />
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-4">
              <FlaskConical className="w-6 h-6 text-muted-foreground" />
            </div>
            <h3 className="text-sm font-medium mb-1">No sessions yet</h3>
            <p className="text-sm text-muted-foreground text-center max-w-sm">
              Create your first QA session to generate an AI-powered test plan from a Jira ticket.
            </p>
            <Button
              size="sm"
              className="mt-4 gap-1.5"
              onClick={() => setOpen(true)}
              data-testid="button-empty-new-session"
            >
              <Plus className="w-3.5 h-3.5" />
              New Session
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function StatCard({
  title,
  value,
  icon: Icon,
  isLoading,
}: {
  title: string;
  value: number;
  icon: any;
  isLoading: boolean;
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 py-4 px-5">
        <div className="w-9 h-9 rounded-md bg-primary/10 flex items-center justify-center">
          <Icon className="w-4 h-4 text-primary" />
        </div>
        <div>
          {isLoading ? (
            <Skeleton className="h-6 w-8" />
          ) : (
            <div className="text-lg font-semibold" data-testid={`stat-${title.toLowerCase().replace(/\s+/g, "-")}`}>
              {value}
            </div>
          )}
          <div className="text-xs text-muted-foreground">{title}</div>
        </div>
      </CardContent>
    </Card>
  );
}
