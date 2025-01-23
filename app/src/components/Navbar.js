import "./Navbar.css";
import logo from "./images/LT_logo.svg";
import toto_logo from "./images/ToTo_logo.png";
import { useNavigate, useLocation } from "react-router-dom";
import { useEffect } from "react";

function Navbar() {
  const token = localStorage.getItem("token");
  const isLoggedIn = token !== null;
  const navigate = useNavigate();
  const location = useLocation(); // Hook to get the current URL location

  const handleLogout = () => {
    localStorage.removeItem("token");
    navigate("/");
  };

  useEffect(() => {
    const user = localStorage.getItem("token");
    if (user) {
      // `isLoggedIn` logic doesn't need reassignment as it is derived
    }
  }, [token]);

  const currentLogo = location.pathname === "/realtime_ai" ? toto_logo : logo;

  return (
    <div className="navbar">
      <img
        src={currentLogo}
        className="logo"
        alt="logo"
        onClick={() => {
          if (isLoggedIn) {
            navigate("/dashboard");
          } else {
            navigate("/");
          }
        }}
      />
      {isLoggedIn && (
        <button className="logout-btn" onClick={handleLogout}>
          Log out
        </button>
      )}
    </div>
  );
}

export default Navbar;