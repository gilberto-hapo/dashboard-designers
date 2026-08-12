import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import Index from "./pages/Index.tsx";
import NotFound from "./pages/NotFound.tsx";
import ClientPortal from "./pages/ClientPortal.tsx";
import PortalPostDetail from "./pages/PortalPostDetail.tsx";
import CalendarDetail from "./pages/CalendarDetail.tsx";
import CalendarPostDetail from "./pages/CalendarPostDetail.tsx";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Index />} />
          <Route path="/portal/:token" element={<ClientPortal />} />
          <Route path="/portal/:token/posts/:postId" element={<PortalPostDetail />} />
          <Route path="/calendarios/:id" element={<CalendarDetail />} />
          <Route path="/calendarios/:id/posts/:postId" element={<CalendarPostDetail />} />
          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
