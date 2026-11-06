import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import Home from './pages/Home';
import TweetDetail from './pages/TweetDetail';
import NotFound from './components/NotFound';
import ScrollToTop from './components/ScrollToTop';

function App() {
  return (
    <Router>
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-50 focus:bg-vermillion focus:px-4 focus:py-2.5 focus:font-mono focus:text-[10px] focus:tracking-[0.14em] focus:text-paper focus:uppercase"
      >
        Aller au contenu
      </a>
      <ScrollToTop />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/tweet/:id" element={<TweetDetail />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </Router>
  );
}

export default App;
