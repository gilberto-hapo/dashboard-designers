import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import Index from "./pages/Index.tsx";
import NotFound from "./pages/NotFound.tsx";
import ClientPortal from "./pages/ClientPortal.tsx";
import CopywriterPortal from "./pages/CopywriterPortal.tsx";
import CopywriterPostDetail from "./pages/CopywriterPostDetail.tsx";
import PortalPostDetail from "./pages/PortalPostDetail.tsx";
import CalendarDetail from "./pages/CalendarDetail.tsx";
import CalendarPostDetail from "./pages/CalendarPostDetail.tsx";
import ClientDetail from "./pages/ClientDetail.tsx";
import FeedbackPostDetail from "./pages/FeedbackPostDetail.tsx";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Index />} />
          <Route path="/painel/:view" element={<Index />} />
          <Route path="/portal/:token" element={<ClientPortal />} />
          <Route path="/portal/:token/posts/:postId" element={<PortalPostDetail />} />
          <Route path="/copywriter-portal" element={<CopywriterPortal />} />
          <Route path="/copywriter-portal/posts/:postId" element={<CopywriterPostDetail />} />
          <Route path="/calendarios/:id" element={<CalendarDetail />} />
          <Route path="/calendarios/:id/posts/:postId" element={<CalendarPostDetail />} />
          <Route path="/clientes/:id" element={<ClientDetail />} />
          <Route path="/feedback/posts/:postId" element={<FeedbackPostDetail />} />
          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
