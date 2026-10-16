import { FlowBuilder } from "@/components/FlowBuilder";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <FlowBuilder id={decodeURIComponent(id)} />;
}
