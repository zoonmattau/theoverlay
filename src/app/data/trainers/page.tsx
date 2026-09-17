import { Suspense } from "react";

import { PeopleList } from "../people";

export default function Page({ searchParams }: PageProps<"/data/trainers">) {
  return (
    <Suspense fallback={<div className="skeleton h-96 mt-6" />}>
      <PeopleList kind="trainer" searchParams={searchParams} />
    </Suspense>
  );
}
