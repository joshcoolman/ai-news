import { read } from "@/lib/store";
import { SettingsForm } from "@/components/settings/SettingsForm";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const { settings } = await read();
  return <SettingsForm initial={settings} />;
}
