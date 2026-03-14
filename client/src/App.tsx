import { Switch, Route, Router } from "wouter";
import { useHashLocation } from "wouter/use-hash-location";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/lib/theme";
import { Layout } from "@/components/Layout";
import Dashboard from "@/pages/Dashboard";
import Plan from "@/pages/Plan";
import Test from "@/pages/Test";
import Report from "@/pages/Report";
import Settings from "@/pages/Settings";
import ManagerDashboard from "@/pages/ManagerDashboard";
import NotFound from "@/pages/not-found";

function AppRouter() {
  return (
    <Layout>
      <Switch>
        <Route path="/" component={Dashboard} />
        <Route path="/session/:id/plan" component={Plan} />
        <Route path="/session/:id/test" component={Test} />
        <Route path="/session/:id/report" component={Report} />
        <Route path="/settings" component={Settings} />
        <Route path="/manager" component={ManagerDashboard} />
        <Route component={NotFound} />
      </Switch>
    </Layout>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <ThemeProvider>
          <Toaster />
          <Router hook={useHashLocation}>
            <AppRouter />
          </Router>
        </ThemeProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
