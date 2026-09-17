import { Suspense } from "react";

import { PersonPage } from "../../people";

export default function Page({ params }: PageProps<"/data/trainers/[key]">) {
  return (
    <Suspense fallback={<div className="skeleton h-96 mt-6" />}>
      <PersonPage kind="trainer" params={params} />
    </Suspense>
  );
}
