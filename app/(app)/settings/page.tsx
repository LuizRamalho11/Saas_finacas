import { getProfile } from "@/lib/api";
import { ProfileSettings } from "@/components/settings/profile-settings";

export default async function SettingsPage() {
  const profile = await getProfile();
  return <ProfileSettings profile={profile} />;
}
