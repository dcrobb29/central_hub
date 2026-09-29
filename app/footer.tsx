import "./styles.css";
export default function Footer() {
  return (
    <div className="footer">
      <a href="https://www.facebook.com" target="_blank" rel="noopener noreferrer">
        <img className="linkLogo" src="/facebook.jpg"/></a>
      <a href="https://www.X.com" target="_blank" rel="noopener noreferrer">
        <img className="linkLogo" src="/xLogo.png"/></a>
      <a href="https://www.instagram.com" target="_blank" rel="noopener noreferrer">
        <img className="linkLogo" src="/instagram.png"/></a>
      <a href="https://www.linkedin.com" target="_blank" rel="noopener noreferrer">
        <img className="linkLogo" src="/linkedin.png"/></a>
    </div>
  );
}
