import { ContactDetail } from "@/components/ContactDetail";

export default async function Page({ params }: { params: Promise<{ phone: string }> }) {
  const { phone } = await params;
  return <ContactDetail phone={decodeURIComponent(phone)} />;
}
