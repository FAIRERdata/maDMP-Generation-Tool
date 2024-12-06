import React, { useState, useEffect } from 'react';
import Form, { IChangeEvent } from '@rjsf/core';
import validator from '@rjsf/validator-ajv8';
import './App.css';
import Modal from './Modal'; // Import the modal component
import ModalContent from './ModalContent'; // Import the modal content component

function App() {
  const [schemaList, setSchemaList] = useState<{ name_n_version: string; schema_path: string; uischema_path: string; toc: string  }[]>([]);
  const [selectedSchema, setSelectedSchema] = useState<{ name_n_version: string; schema_path: string; uischema_path: string; toc: string } | null>(null);
  const [schema, setSchema] = useState({});
  const [uiSchema, setUiSchema] = useState({});
  const [formData, setFormData] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [introHtml, setIntroHtml] = useState<string | null>(null);

  const [isModalOpen, setModalOpen] = useState(false);
  const openModal = () => setModalOpen(true);
  const closeModal = () => setModalOpen(false);

  const folder_path = 'https://raw.githubusercontent.com/FAIRERdata/maDMP-Standard/Master/examples/JSON/PublishedSchemas/';
  const metaDataUrl = folder_path + 'schema_metadata.json';

  // Fetch intro HTML dynamically
  useEffect(() => {
    const intro_path = "https://raw.githubusercontent.com/FAIRERdata/maDMP-Generation-Form/refs/heads/master/public/intro.html"
    fetch(intro_path)
      .then((response) => {
        if (!response.ok) {
          throw new Error('Failed to fetch intro content');
        }
        return response.text();
      })
      .then((html) => {
        setIntroHtml(html);
      })
      .catch((error) => {
        console.error(error);
      });
  }, []);
  
  // fetch schema metadata
  useEffect(() => {
    fetch(metaDataUrl)
      .then((res) => res.json())
      .then((data) => {
        setSchemaList(data);
        setSelectedSchema(data[0]);
      })
      .catch((err) => {
        console.error(err);
        setError('Failed to load schema metadata.');
      });
  }, [metaDataUrl]);

  // Fetch schema and uiSchema when selectedSchema changes
  useEffect(() => {
    if (!selectedSchema) return;

    setLoading(true);
    setError(null);

    const schemaUrl = folder_path + selectedSchema.schema_path;
    const uiSchemaUrl = folder_path + selectedSchema.uischema_path;

    Promise.all([fetch(schemaUrl).then((res) => res.json()), fetch(uiSchemaUrl).then((res) => res.json())])
      .then(([schemaData, uiSchemaData]) => {
        // Preprocess schema to modify titles
        const processedSchema = preprocessSchema(schemaData);

        uiSchemaData['ui:submitButtonOptions'] = { submitText: 'Validate' };
        setSchema(processedSchema);
        setUiSchema(uiSchemaData);
        setLoading(false);
      })
      .catch((err) => {
        console.error(err);
        setError('Failed to load schema.');
        setLoading(false);
      });
  }, [selectedSchema]);

  // Helper function to preprocess schema
  const preprocessSchema = (schema: any): any => {
    if (!schema || typeof schema !== 'object') return schema;
  
    // Process "allOf" structures
    if (schema.allOf && Array.isArray(schema.allOf)) {
      schema.allOf = schema.allOf.map(preprocessSchema); // Process each subschema
    }
  
    // Process "if-then" structures
    if (schema.if) {
      schema.if = preprocessSchema(schema.if);
    }
    if (schema.then) {
      schema.then = preprocessSchema(schema.then);
    }
  
    // Update "title" with "question" if both exist
    if (schema.title && schema.question) {
      schema.title = `${schema.question} [${schema.title}]`;
    }
  
    // Recursively process properties
    if (schema.properties) {
      Object.keys(schema.properties).forEach((key) => {
        schema.properties[key] = preprocessSchema(schema.properties[key]);
      });
    }
  
    // Process "items" if it's an array
    if (schema.type === 'array' && schema.items) {
      schema.items = preprocessSchema(schema.items);
    }
  
    return schema;
  };
  
  
  const generateToC = (schema: any, formData: any, parentKey: string = 'root'): JSX.Element[] => {
    if (!schema || typeof schema !== 'object') return [];
  
    const tocItems: JSX.Element[] = [];
  
    // Handle normal properties
    if (schema.properties) {
      tocItems.push(
        ...Object.keys(schema.properties).map((key) => {
          const fullPath = parentKey ? `${parentKey}_${key}` : key;
          const property = schema.properties[key];
          const data = formData ? formData[key] : undefined;
  
          return (
            <li key={fullPath}>
              <a
                href={`#${fullPath}`}
                className="toc-link"
                onClick={(e) => {
                  e.preventDefault();
                  const nestedList = e.currentTarget.nextElementSibling;
                  if (nestedList) {
                    nestedList.classList.toggle('show');
                  }
                  setTimeout(() => {
                    window.location.hash = fullPath;
                  }, 100);
                }}
              >
                {key}
              </a>
              {property.type === 'object' && property.properties && (
                <ul className="nested-toc">{generateToC(property, data, fullPath)}</ul>
              )}
              {property.type === 'array' && Array.isArray(data) && (
                <ul className="nested-toc">
                  {data.map((item: any, index: number) => (
                    <li key={`${fullPath}_${index}`}>
                      <a
                        href={`#${fullPath}_${index}`}
                        className="toc-link"
                        onClick={(e) => {
                          e.preventDefault();
                          const nestedList = e.currentTarget.nextElementSibling;
                          if (nestedList) {
                            nestedList.classList.toggle('show');
                          }
                          setTimeout(() => {
                            window.location.hash = `${fullPath}_${index}`;
                          }, 100);
                        }}
                      >
                        {`${key} [${index + 1}]`}
                      </a>
                      {property.items && generateToC(property.items, item, `${fullPath}_${index}`)}
                    </li>
                  ))}
                </ul>
              )}
            </li>
          );
        })
      );
    }
  
    // Handle "allOf"
    if (Array.isArray(schema.allOf)) {
      schema.allOf.forEach((subSchema: any, index: number) => {
        const subKey = `${parentKey}_allOf_${index}`;
        tocItems.push(...generateToC(subSchema, formData, subKey));
      });
    }
  
    // Handle "if/then/else"
    if (schema.if && schema.then) {
      // Add "if" logic to ToC (optional)
      if (formData && evaluateCondition(schema.if, formData)) {
        tocItems.push(...generateToC(schema.then, formData, `${parentKey}_then`));
      }
      if (schema.else) {
        tocItems.push(...generateToC(schema.else, formData, `${parentKey}_else`));
      }
    }
  
    // Handle nested arrays
    if (schema.type === 'array' && schema.items) {
      const nestedData = Array.isArray(formData) ? formData : [];
      tocItems.push(
        ...nestedData.map((item: any, index: number) => {
          const arrayKey = `${parentKey}_${index}`;
          return (
            <li key={arrayKey}>
              <a
                href={`#${arrayKey}`}
                className="toc-link"
                onClick={(e) => {
                  e.preventDefault();
                  const nestedList = e.currentTarget.nextElementSibling;
                  if (nestedList) {
                    nestedList.classList.toggle('show');
                  }
                  setTimeout(() => {
                    window.location.hash = arrayKey;
                  }, 100);
                }}
              >
                {`Item [${index + 1}]`}
              </a>
              {generateToC(schema.items, item, arrayKey)}
            </li>
          );
        })
      );
    }
  
    return tocItems;
  };
  
  
  // Helper function to evaluate "if" conditions
  const evaluateCondition = (condition: any, formData: any): boolean => {
    if (!condition || !formData) return false;
    // Implement basic checks for "properties" or "enum"
    if (condition.properties) {
      return Object.keys(condition.properties).every((key) =>
        condition.properties[key].enum
          ? condition.properties[key].enum.includes(formData[key])
          : true
      );
    }
    return false;
  };
  

  // Handle form data change
  const handleChange = ({ formData }: IChangeEvent<FormData>) => {
    setFormData(formData as object);
  };


  // Handle JSON upload
  const uploadJSON = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const json = JSON.parse(e.target?.result as string);
          setFormData(json);
        } catch (error) {
          alert('Invalid JSON file.');
        }
      };
      reader.readAsText(file);
    }
  };

  // Download the formData as JSON
  const downloadJSON = () => {
    const blob = new Blob([JSON.stringify(formData, null, 2)], { type: 'application/json' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'formData.json';
    link.click();
  };

  return (
    <div className="layout-container">
      {/* Top Content Section */}
      <div className="top-content">
        <div className='top-content-container'>
          {/* Top Content Section */}
          <div dangerouslySetInnerHTML={{ __html: introHtml || '<p>Loading...</p>' }} />
          
          {/* Open Modal Button */}
          <p>
            <a href="#" onClick={(e) => {
              e.preventDefault();
              openModal();
            }}>
              Author Statement
            </a>

            {/* Modal Component */}
            <Modal isOpen={isModalOpen} onClose={closeModal}>
              <ModalContent onClose={closeModal} /> {/* Pass closeModal as a prop */}
            </Modal>
          </p>
        </div>
      </div>

      {/* Table of Contents */}
      {selectedSchema && !error && (
          <div className="toc">
              <h2>Table of Contents</h2>
              <ul>{generateToC(schema, formData)}</ul>
          </div>
      )}

      {/* Main Form Content */}
      <div className="form-container">
          <div className="dropdown">
              <label 
                style={{paddingRight: '10px'}} 
                htmlFor="schema-select">Choose a schema version: </label>
              <select 
                  id="schema-select"
                  value={selectedSchema?.name_n_version || ''}
                  onChange={(e) => {
                    const selected = schemaList.find(
                        (s) => s.name_n_version === e.target.value
                    );
                    if (selected) setSelectedSchema(selected);
                  }}
              >
                  <option value="" disabled>
                      Select a schema version
                  </option>
                  {schemaList.map((s) => (
                      <option key={s.name_n_version} value={s.name_n_version}>
                          {s.name_n_version}
                      </option>
                  ))}
              </select>
          </div>

          {/* Display error message */}
          {error && <div className="error-message">Error: {error}</div>}

          {/* Display form */}
          {selectedSchema && !error && (
              <Form
                  schema={schema}
                  uiSchema={uiSchema}
                  validator={validator}
                  formData={formData as any}
                  onChange={handleChange}
              />
          )}

          <div id='bottom'>
              <button
                  type="button"
                  className="btn btn-info bottom-button"
                  onClick={downloadJSON}
              >
                  Download JSON
              </button>
              <input type="file" accept=".json" onChange={uploadJSON} />
          </div>
      </div>

      {/* Floating Side Panel */}
      <div className="side-panel">
          <button
              type="button"
              className="btn btn-info"
              style={{ marginTop: '10px' }}
              onClick={downloadJSON}
          >
              Download JSON
          </button>
          <input
              type="file"
              accept=".json"
              onChange={uploadJSON}
              style={{ marginTop: '10px' }}
          />
          <a className="source_code" href="#schema-select">Go to top</a>
          <a className="source_code" href="#bottom">Go to bottom</a>
          <a
              className="source_code"
              href="https://github.com/FAIRERdata/maDMP-Generation-Tool"
          >
              Source code
          </a>
      </div>
    </div>
  );
}

export default App;