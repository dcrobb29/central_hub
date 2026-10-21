import "./styles.css";
import Link from "next/link";
import UserProfile from "./components/user-profile";
import HeaderCompanyName from "./components/header-company-name";
import SampleDataToggle from "./components/sample-data-toggle";
import { ThemeToggle } from "./components/appearance-provider";

export default function Header() {
  return (
      <div className="header">
        <Link href="/" aria-label="Go to home page">
          <img className="logo" src="/logo2.png" alt="Logo" />
        </Link>
        <HeaderCompanyName />
        <div className="headerRight">
          <ThemeToggle />
          <SampleDataToggle />
          <UserProfile />
        </div>
      </div>
  );
}
