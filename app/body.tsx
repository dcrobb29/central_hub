import Link from "next/link";
import Image from "next/image";
import { ArrowUpRight, BriefcaseBusiness, ClipboardCheck, ClipboardList } from "lucide-react";
import "./styles.css";

const HOME_TILES = [
  {
    href: "/sales",
    label: "Sales & Estimates",
    description: "Leads, estimates, and quotes",
    image: null,
    icon: ClipboardList,
  },
  {
    href: "/projects",
    label: "Projects & Jobs",
    description: "Scope, milestones, and job progress",
    image: null,
    icon: BriefcaseBusiness,
  },
  {
    href: "/finances",
    label: "Finances",
    description: "Invoices, bills, and project totals",
    image: "/financeLogo.jpg",
    icon: null,
  },
  {
    href: "/field-operations",
    label: "Field Operations",
    description: "Weekly job, employee, and equipment scheduling",
    image: null,
    icon: ClipboardCheck,
  },
  {
    href: "/personnel",
    label: "People",
    description: "Employees and reporting structure",
    image: "/personnelLogo.png",
    icon: null,
  },
  {
    href: "/files",
    label: "Files",
    description: "Company documents and job media",
    image: "/filesLogo.png",
    icon: null,
  },
];

export default function Body() {
  return (
    <main className="body homeBody">
      <div className="homeShell">
        <div className="homeLauncher">
          {HOME_TILES.map((tile, index) => (
            <Link className={`homeTile homeTile${index}`} href={tile.href} key={tile.href}>
              <span className="homeTileMark" aria-hidden="true">
                {tile.image ? <Image src={tile.image} width={76} height={76} alt="" /> : tile.icon ? <tile.icon size={42} strokeWidth={1.5} /> : null}
              </span>
              <span className="homeTileText">
                <span className="homeTileTitle">{tile.label}</span>
                <span className="homeTileDescription">{tile.description}</span>
              </span>
              <span className="homeTileArrow" aria-hidden="true"><ArrowUpRight size={17} /></span>
            </Link>
          ))}
        </div>
      </div>
    </main>
  );
}
