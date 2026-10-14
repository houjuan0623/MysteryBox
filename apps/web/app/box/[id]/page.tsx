import { BoxResults } from "./results-client";
export default async function BoxPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <BoxResults id={id} />;
}
