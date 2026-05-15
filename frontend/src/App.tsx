import AppRouter from "@/routes/AppRouter";
import SkipLink from "@/components/SkipLink";
import { useFocusMain } from "@/hooks/useFocusMain";

export default function App() {
  useFocusMain();
  return (
    <>
      <SkipLink />
      <AppRouter />
    </>
  );
}
