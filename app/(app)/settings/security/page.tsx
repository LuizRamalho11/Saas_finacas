import { getLoginHistory } from "@/lib/actions/auth";
import { SecurityPanel } from "@/components/settings/security-panel";

export const metadata = { title: "Segurança" };

// O histórico muda a cada login: nada de cache estático aqui.
export const dynamic = "force-dynamic";

export default async function SecurityPage() {
  const history = await getLoginHistory(25);
  return <SecurityPanel history={history} />;
}
