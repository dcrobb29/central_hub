import "./styles.css";
import Link from "next/link";
import UserProfile from "./components/userProfile";

export default function Header() {
  return (
    <div className="header">
      <Link href="/" aria-label="Go to home page">
        <img className="logo" src="/logo.png" alt="Logo" />
      </Link>
        <h1> Company Name </h1>
      <UserProfile />
    </div>
  );
}
