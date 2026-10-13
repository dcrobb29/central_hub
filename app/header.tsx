import "./styles.css";
import Link from "next/link";
import UserProfile from "./components/user-profile";
import HeaderCompanyName from "./components/header-company-name";
import { AccountSessionProvider } from "./components/account-session-context";

export default function Header() {
  return (
    <AccountSessionProvider>
      <div className="header">
        <Link href="/" aria-label="Go to home page">
          <img className="logo" src="/logo.png" alt="Logo" />
        </Link>
        <HeaderCompanyName />
        <UserProfile />
      </div>
    </AccountSessionProvider>
  );
}
