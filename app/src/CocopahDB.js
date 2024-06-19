import "./CocopahDB.css";
import axios from "axios";
import { API_BASE_URL } from "./config";
import FileDropComponent from "./components/FileDropComponent";
import Navbar from "./components/Navbar";
import { useState } from "react";

function CocopahDB() {
  const [offerTable, setOfferTable] = useState(null);
  const [activePatrons, setActivePatrons] = useState(null);
  const [wmyPatrons, setWmyPatrons] = useState(null);
  const [wsmyPatrons, setWsmyPatrons] = useState(null);
  const [seasonalPatrons, setSeasonalPatrons] = useState(null);
  const [patriotCardPatrons, setPatriotCardPatrons] = useState(null);
  const [claTierPatrons, setClaTierPatrons] = useState(null);

  const [specialOffers, setSpecialOffers] = useState(
    Array(5).fill({
      visible: false,
      patriotOnly: false,
      type: "Tier-based",
      tierData: Array(20).fill({ yesNo: "", amount: "", time: "" }),
      cardData: { T1: "", T2: "", T3: "" }, // Card types should be updated accordingly
    })
  );

  const onOfferTableFileUpload = (extractedColumns, uploadedFile) => {
    setOfferTable(uploadedFile);
  };

  const onActivePatronsFileUpload = (extractedColumns, uploadedFile) => {
    setActivePatrons(uploadedFile);
  };

  const onWmyPatronsFileUpload = (extractedColumns, uploadedFile) => {
    setWmyPatrons(uploadedFile);
  };

  const onWsmyPatronsFileUpload = (extractedColumns, uploadedFile) => {
    setWsmyPatrons(uploadedFile);
  };

  const onSeasonalPatronsFileUpload = (extractedColumns, uploadedFile) => {
    setSeasonalPatrons(uploadedFile);
  };

  const onPatriotCardPatronsFileUpload = (extractedColumns, uploadedFile) => {
    setPatriotCardPatrons(uploadedFile);
  };

  const onClaTierPatronsFileUpload = (extractedColumns, uploadedFile) => {
    setClaTierPatrons(uploadedFile);
  };

  const handleRadioChange = (index) => {
    setSpecialOffers((prevOffers) =>
      prevOffers.map((offer, i) =>
        i === index ? { ...offer, visible: !offer.visible } : offer
      )
    );
  };

  const handleCheckboxChange = (index) => {
    setSpecialOffers((prevOffers) =>
      prevOffers.map((offer, i) =>
        i === index
          ? {
              ...offer,
              visible: !offer.visible,
              // Clear data if unchecked
              patriotOnly: !offer.visible ? false : offer.patriotOnly,
              type: !offer.visible ? "Tier-based" : offer.type,
              tierData: !offer.visible
                ? Array(20).fill({ yesNo: "", amount: "", time: "" })
                : offer.tierData,
              cardData: !offer.visible
                ? {
                    T1: { yesNo: "", amount: "", time: "" },
                    T2: { yesNo: "", amount: "", time: "" },
                    T3: { yesNo: "", amount: "", time: "" },
                  }
                : offer.cardData,
            }
          : offer
      )
    );
  };

  const handlePatriotOnlyChange = (index) => {
    setSpecialOffers((prevOffers) =>
      prevOffers.map((offer, i) =>
        i === index ? { ...offer, patriotOnly: !offer.patriotOnly } : offer
      )
    );
  };

  const handleSelectChange = (index, value) => {
    setSpecialOffers((prevOffers) =>
      prevOffers.map((offer, i) =>
        i === index ? { ...offer, type: value } : offer
      )
    );
  };

  const handleTierDataChange = (index, row, col, value) => {
    setSpecialOffers((prevOffers) => {
      const newOffers = [...prevOffers];
      newOffers[index] = {
        ...newOffers[index],
        tierData: newOffers[index].tierData.map((data, i) =>
          i === row ? { ...data, [col]: value } : data
        ),
      };
      return newOffers;
    });
  };

  const handleCardDataChange = (index, cardType, col, value) => {
    setSpecialOffers((prevOffers) => {
      const newOffers = [...prevOffers];
      newOffers[index] = {
        ...newOffers[index],
        cardData: {
          ...newOffers[index].cardData,
          [cardType]: {
            ...newOffers[index].cardData[cardType],
            [col]: value,
          },
        },
      };
      return newOffers;
    });
  };

  const handleCardTypeChange = (index, value) => {
    setSpecialOffers((prevOffers) =>
      prevOffers.map((offer, i) =>
        i === index ? { ...offer, cardType: value } : offer
      )
    );
  };

  const handleCopyDown = (index, dataType, col) => {
    setSpecialOffers((prevOffers) => {
      const newOffers = [...prevOffers];
  
      if (dataType === 'tierData') {
        const firstValue = newOffers[index][dataType][0][col] || "";
        for (let i = 1; i < newOffers[index][dataType].length; i++) {
          newOffers[index][dataType][i][col] = firstValue;
        }
      } else if (dataType === 'cardData') {
        const cardTypes = Object.keys(newOffers[index][dataType]);
        const firstValue = newOffers[index][dataType][cardTypes[0]][col] || "";
        cardTypes.forEach((cardType) => {
          newOffers[index][dataType][cardType][col] = firstValue;
        });
      }
  
      return newOffers;
    });
  };

  const submitFiles = async () => {
    try {
      // Gather all special offer data
      const offerData = specialOffers.map((offer, index) => ({
        visible: offer.visible,
        patriotOnly: offer.patriotOnly,
        type: offer.type,
        tierData: offer.tierData,
        cardData: offer.cardData,
        cardType: offer.cardType
      }));
  
      // Create a FormData object to include all files and special offer data
      const formData = new FormData();
      if (offerTable) formData.append('offerTable', offerTable);
      if (activePatrons) formData.append('activePatrons', activePatrons);
      if (wmyPatrons) formData.append('wmyPatrons', wmyPatrons);
      if (wsmyPatrons) formData.append('wsmyPatrons', wsmyPatrons);
      if (seasonalPatrons) formData.append('seasonalPatrons', seasonalPatrons);
      if (patriotCardPatrons) formData.append('patriotCardPatrons', patriotCardPatrons);
      if (claTierPatrons) formData.append('claTierPatrons', claTierPatrons);
  
      // Append the special offer data as a JSON string
      formData.append('offerData', JSON.stringify(offerData));
  
      // Make the API request to send the data
      const response = await axios.post(`${API_BASE_URL}/mailing-list-generation`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data'
        }
      });
  
      // Handle the response as needed
      console.log('Mailing list generation successful:', response.data);
      alert('Mailing list generation successful!');
    } catch (error) {
      console.error('Error generating mailing list:', error);
      alert('Error generating mailing list. Please try again.');
    }
  };

  return (
    <>
    <Navbar />
      <div className="ml-file-drops">
        <div className="file-header-combo">
          <h4>Offer Table</h4>
          <FileDropComponent
            onFileUpload={onOfferTableFileUpload}
            className="file-area"
          />
        </div>
        <div className="file-header-combo">
          <h4>Active Patrons</h4>
          <FileDropComponent
            onFileUpload={onActivePatronsFileUpload}
            className="file-area"
          />
        </div>
        <div className="file-header-combo">
          <h4>WMY Patrons</h4>
          <FileDropComponent
            onFileUpload={onWmyPatronsFileUpload}
            className="file-area"
          />
        </div>
        <div className="file-header-combo">
          <h4>WSMY Patrons</h4>
          <FileDropComponent
            onFileUpload={onWsmyPatronsFileUpload}
            className="file-area"
          />
        </div>
        <div className="file-header-combo">
          <h4>Seasonal Patrons</h4>
          <FileDropComponent
            onFileUpload={onSeasonalPatronsFileUpload}
            className="file-area"
          />
        </div>
        <div className="file-header-combo">
          <h4>Patriot Card Patrons</h4>
          <FileDropComponent
            onFileUpload={onPatriotCardPatronsFileUpload}
            className="file-area"
          />
        </div>
        <div className="file-header-combo">
          <h4>CLA Tier Patrons</h4>
          <FileDropComponent
            onFileUpload={onClaTierPatronsFileUpload}
            className="file-area"
          />
        </div>
        <div className="file-header-combo">
          <h2>Generate Mailing List</h2>
          <p>Once all files are uploaded and special offer logic has been filled out<br /> press the submit button to generate the mailing list</p>

          <button onClick={(e) => {
            submitFiles();
          }}>Generate Mailing List</button>
        </div>
      </div>

      <div className="special-offers">
        {specialOffers.map((offer, index) => (
          <div key={index} className="special-offer">
            <div className="header">
              <input
                type="checkbox"
                checked={offer.visible}
                onChange={() => handleCheckboxChange(index)}
              />
              <h4>Special Offer {index + 1}</h4>
            </div>
            {offer.visible && (
              <>
                <div className="patriot-checkbox">
                  <input
                    type="checkbox"
                    checked={offer.patriotOnly}
                    onChange={() => handlePatriotOnlyChange(index)}
                  />
                  <label>Patriot Only</label>
                </div>
                <div>
                  <select
                    value={offer.type}
                    onChange={(e) => handleSelectChange(index, e.target.value)}
                  >
                    <option value="Tier-based">Tier-based</option>
                    <option value="Card-type based">Card-type based</option>
                  </select>
                </div>
                {offer.type === "Tier-based" ? (
                  <table>
                    <thead>
                      <tr>
                        <th></th>
                        <th>
                          Yes/No
                          <button
                            onClick={() =>
                              handleCopyDown(index, "tierData", "yesNo")
                            }
                          >
                            Copy Down
                          </button>
                        </th>
                        <th>
                          Amount
                          <button
                            onClick={() =>
                              handleCopyDown(index, "tierData", "amount")
                            }
                          >
                            Copy Down
                          </button>
                        </th>
                        <th>
                          Time
                          <button
                            onClick={() =>
                              handleCopyDown(index, "tierData", "time")
                            }
                          >
                            Copy Down
                          </button>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {Array.from({ length: 20 }, (_, i) => `T${i + 1}`).map(
                        (tier, rowIndex) => (
                          <tr key={rowIndex}>
                            <td>{tier}</td>
                            <td>
                              <input
                                type="text"
                                value={offer.tierData[rowIndex]?.yesNo || ""}
                                onChange={(e) =>
                                  handleTierDataChange(
                                    index,
                                    rowIndex,
                                    "yesNo",
                                    e.target.value
                                  )
                                }
                              />
                            </td>
                            <td>
                              <input
                                type="text"
                                value={offer.tierData[rowIndex]?.amount || ""}
                                onChange={(e) =>
                                  handleTierDataChange(
                                    index,
                                    rowIndex,
                                    "amount",
                                    e.target.value
                                  )
                                }
                              />
                            </td>
                            <td>
                              <input
                                type="text"
                                value={offer.tierData[rowIndex]?.time || ""}
                                onChange={(e) =>
                                  handleTierDataChange(
                                    index,
                                    rowIndex,
                                    "time",
                                    e.target.value
                                  )
                                }
                              />
                            </td>
                          </tr>
                        )
                      )}
                    </tbody>
                  </table>
                ) : (
                  <>
                    <div className="lowest-tier-section">
                      <label>Lowest Tier to receive offer: </label>
                      <select
                        value={offer.cardType}
                        onChange={(e) =>
                          handleCardTypeChange(index, e.target.value)
                        }
                      >
                        {Array.from({ length: 20 }, (_, i) => `T${i + 1}`).map(
                          (tier) => (
                            <option key={tier} value={tier}>
                              {tier}
                            </option>
                          )
                        )}
                      </select>
                    </div>
                    <table>
                      <thead>
                        <tr>
                          <th></th>
                          <th>
                            Yes/No
                          </th>
                          <th>
                            Amount
                          </th>
                          <th>
                            Time
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {["Classic", "Plus", "Preferred"].map(
                          (cardType, rowIndex) => (
                            <tr key={rowIndex}>
                              <td>{cardType}</td>
                              <td>
                                <input
                                  type="text"
                                  value={offer.cardData[cardType]?.yesNo || ""}
                                  onChange={(e) =>
                                    handleCardDataChange(
                                      index,
                                      cardType,
                                      "yesNo",
                                      e.target.value
                                    )
                                  }
                                />
                              </td>
                              <td>
                                <input
                                  type="text"
                                  value={offer.cardData[cardType]?.amount || ""}
                                  onChange={(e) =>
                                    handleCardDataChange(
                                      index,
                                      cardType,
                                      "amount",
                                      e.target.value
                                    )
                                  }
                                />
                              </td>
                              <td>
                                <input
                                  type="text"
                                  value={offer.cardData[cardType]?.time || ""}
                                  onChange={(e) =>
                                    handleCardDataChange(
                                      index,
                                      cardType,
                                      "time",
                                      e.target.value
                                    )
                                  }
                                />
                              </td>
                            </tr>
                          )
                        )}
                      </tbody>
                    </table>
                  </>
                )}
              </>
            )}
          </div>
        ))}
      </div>
    </>
  );
}

export default CocopahDB;
