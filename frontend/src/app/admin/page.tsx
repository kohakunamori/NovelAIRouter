import type { Metadata } from "next"

import { NovelAIAdminConsole } from "@/components/novelai-admin-console"

export const metadata: Metadata = {
  title: "Router Admin",
}

export default function AdminPage() {
  return <NovelAIAdminConsole />
}
