"use client";

import { useRouter } from "next/navigation";
import "./styles.css";
import Button from "./components/button";

export default function Body() {
  const router = useRouter();

  return (
    <div className="body">
      <div className="buttonGroup">
        <Button className="routeFinance" onClick={() => router.push("/finances")} children={undefined}></Button>
        <Button className="routePersonnel" onClick={() => router.push("/personnel")} children={undefined}></Button>
        <Button className="routeFiles" onClick={() => router.push("/files")} children={undefined}></Button>
      </div>
    </div>
  );
}
