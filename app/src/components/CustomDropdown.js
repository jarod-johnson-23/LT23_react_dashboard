import { useState, useEffect, useRef } from "react";

const CustomDropdown = ({ selectedValue, onChange }) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null); // For detecting clicks outside
  const options = [
    { value: "alloy", label: "Alloy" },
    { value: "ash", label: "Ash" },
    { value: "coral", label: "Coral" },
    { value: "echo", label: "Echo" },
    { value: "fable", label: "Fable" },
    { value: "onyx", label: "Onyx" },
    { value: "nova", label: "Nova" },
    { value: "sage", label: "Sage" },
    { value: "shimmer", label: "Shimmer" },
  ];

  const handleSelect = (value) => {
    onChange(value);
    setIsOpen(false); // Close dropdown after selection
  };

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div className={`custom-dropdown ${isOpen ? "open" : ""}`} ref={dropdownRef}>
      {/* Dropdown Button */}
      <div className="dropdown-header" onClick={() => setIsOpen(!isOpen)}>
        {options.find((opt) => opt.value === selectedValue)?.label || "Select Voice"}
      </div>

      {/* Dropdown Options */}
      <ul className="dropdown-options">
        {options.map((option) => (
          <li
            key={option.value}
            className={`dropdown-item ${option.value === selectedValue ? "selected" : ""}`}
            onClick={() => handleSelect(option.value)}
          >
            {option.label}
          </li>
        ))}
      </ul>
    </div>
  );
};

export default CustomDropdown;