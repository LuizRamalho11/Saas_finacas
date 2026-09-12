import { SettingsNav } from "@/components/settings/settings-nav";
import { SectionHeading } from "@/components/common/section-heading";

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="space-y-6">
      <SectionHeading
        title="Preferências da conta"
        description="Perfil, categorias, contas financeiras e histórico de acesso."
        action={<SettingsNav />}
      />
      {children}
    </div>
  );
}
