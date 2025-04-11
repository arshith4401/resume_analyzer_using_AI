import React, { useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { ThemeProvider, createTheme, CssBaseline, Box, AppBar, Toolbar, Typography, IconButton, Button, Container, TextField, CircularProgress, Alert, Divider, List, ListItem, ListItemText, Card, CardContent, useTheme, alpha, Grid } from '@mui/material';
import { useDropzone } from 'react-dropzone';
import { CloudUpload as CloudUploadIcon, Description as DescriptionIcon, Work as WorkIcon, Logout as LogoutIcon } from '@mui/icons-material';
import axios from 'axios';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import Login from './components/Auth/Login';
import Signup from './components/Auth/Signup';

const theme = createTheme();

const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, loading } = useAuth();

  if (loading) {
    return <div>Loading...</div>;
  }

  if (!user) {
    return <Navigate to="/login" />;
  }

  return <>{children}</>;
};

const Dashboard: React.FC = () => {
  const { signOut } = useAuth();
  const [file, setFile] = useState<File | null>(null);
  const [jobDescription, setJobDescription] = useState('');
  const [analysis, setAnalysis] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const theme = useTheme();

  const onDrop = (acceptedFiles: File[]) => {
    if (acceptedFiles.length > 0) {
      setFile(acceptedFiles[0]);
      setError(null);
    }
  };

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/pdf': ['.pdf']
    },
    maxFiles: 1
  });

  const handleAnalyze = async () => {
    if (!file) {
      setError('Please upload a PDF file');
      return;
    }

    if (!jobDescription) {
      setError('Please enter a job description');
      return;
    }

    setLoading(true);
    setError(null);
    setAnalysis(null);

    try {
      const formData = new FormData();
      formData.append('resume', file);

      // First, upload the file and get the text
      const uploadResponse = await axios.post('http://localhost:5030/api/upload', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });

      // Then, send both the resume text and job description for analysis
      const analysisResponse = await axios.post('http://localhost:5030/api/analyze', {
        resumeText: uploadResponse.data.text,
        jobDescription
      });

      setAnalysis(analysisResponse.data);
    } catch (error) {
      console.error('Error:', error);
      setError('Failed to analyze resume. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box sx={{ flexGrow: 1 }}>
      <AppBar position="static">
        <Toolbar>
          <Typography variant="h6" component="div" sx={{ flexGrow: 1 }}>
            Resume Analyzer
          </Typography>
          <IconButton color="inherit" onClick={() => signOut()}>
            <LogoutIcon />
          </IconButton>
        </Toolbar>
      </AppBar>
      <Box sx={{ p: 3 }}>
        <Container maxWidth="md">
          <Box sx={{ 
            my: 4,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 3
          }}>
            <Typography 
              variant="h3" 
              component="h1" 
              gutterBottom 
              align="center"
              sx={{
                fontWeight: 'bold',
                background: `linear-gradient(45deg, ${theme.palette.primary.main}, ${theme.palette.secondary.main})`,
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                mb: 4,
                animation: 'fadeIn 1s ease-in'
              }}
            >
              Resume Analyzer
            </Typography>

            {error && (
              <Alert severity="error" sx={{ width: '100%', mb: 2 }}>
                {error}
              </Alert>
            )}

            <Card 
              {...getRootProps()} 
              sx={{
                width: '100%',
                p: 3,
                cursor: 'pointer',
                transition: 'all 0.3s ease',
                border: `2px dashed ${isDragActive ? theme.palette.primary.main : theme.palette.divider}`,
                bgcolor: isDragActive ? alpha(theme.palette.primary.main, 0.05) : 'background.paper',
                '&:hover': {
                  borderColor: theme.palette.primary.main,
                  bgcolor: alpha(theme.palette.primary.main, 0.05)
                }
              }}
            >
              <CardContent sx={{ textAlign: 'center' }}>
                <input {...getInputProps()} />
                <CloudUploadIcon sx={{ fontSize: 48, color: 'primary.main', mb: 2 }} />
                {file ? (
                  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1 }}>
                    <DescriptionIcon color="primary" />
                    <Typography>{file.name}</Typography>
                  </Box>
                ) : (
                  <Typography variant="h6">
                    Drag and drop your resume PDF here, or click to select
                  </Typography>
                )}
              </CardContent>
            </Card>

            <Card sx={{ width: '100%', p: 3 }}>
              <CardContent>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                  <WorkIcon color="primary" />
                  <Typography variant="h6">Job Description</Typography>
                </Box>
                <TextField
                  fullWidth
                  multiline
                  rows={4}
                  placeholder="Paste the job description here..."
                  value={jobDescription}
                  onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setJobDescription(e.target.value)}
                  variant="outlined"
                  sx={{
                    '& .MuiOutlinedInput-root': {
                      '&:hover fieldset': {
                        borderColor: theme.palette.primary.main,
                      },
                    },
                  }}
                />
              </CardContent>
            </Card>

            <Button
              fullWidth
              variant="contained"
              onClick={handleAnalyze}
              disabled={!file || !jobDescription || loading}
              size="large"
              sx={{
                py: 2,
                fontSize: '1.1rem',
                background: `linear-gradient(45deg, ${theme.palette.primary.main}, ${theme.palette.secondary.main})`,
                '&:hover': {
                  background: `linear-gradient(45deg, ${theme.palette.primary.dark}, ${theme.palette.secondary.dark})`,
                }
              }}
            >
              {loading ? <CircularProgress size={24} color="inherit" /> : 'Analyze Resume'}
            </Button>

            {analysis && (
              <AnalysisResults analysis={analysis} />
            )}
          </Box>
        </Container>
      </Box>
    </Box>
  );
};

const AnalysisResults = ({ analysis }: { analysis: any }) => {
  if (!analysis || !analysis.analysis) return null;

  const {
    overallScore,
    keyStrengths,
    missingPoints,
    skillsToAdd,
    recommendations
  } = analysis.analysis;

  // Determine the score color based on the match level
  const getScoreColor = (score: number) => {
    if (score >= 80) return '#4caf50'; // Green for good match
    if (score >= 60) return '#ff9800'; // Orange for partial match
    return '#f44336'; // Red for poor match
  };

  // Determine the match level text
  const getMatchLevel = (score: number) => {
    if (score >= 80) return 'Strong Match';
    if (score >= 60) return 'Partial Match';
    return 'Poor Match';
  };

  return (
    <Card sx={{ 
      mt: 4, 
      p: 3,
      background: 'linear-gradient(145deg, #ffffff 0%, #f5f5f5 100%)',
      boxShadow: '0 4px 20px rgba(0, 0, 0, 0.1)',
      borderRadius: 2
    }}>
      <Box sx={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center',
        mb: 4,
        p: 2,
        background: `linear-gradient(90deg, ${getScoreColor(overallScore)} 0%, ${getScoreColor(overallScore)} 100%)`,
        borderRadius: 1,
        color: 'white'
      }}>
        <Box>
          <Typography variant="h5" sx={{ fontWeight: 'bold' }}>
            Resume vs Job Description Analysis
          </Typography>
          <Typography variant="subtitle1" sx={{ mt: 1 }}>
            {getMatchLevel(overallScore)}
          </Typography>
        </Box>
        <Box sx={{ 
          display: 'flex', 
          alignItems: 'center',
          background: 'rgba(255, 255, 255, 0.2)',
          p: '4px 12px',
          borderRadius: 2
        }}>
          <Typography variant="h6" sx={{ mr: 1 }}>
            Match Score:
          </Typography>
          <Typography variant="h4" sx={{ fontWeight: 'bold' }}>
            {overallScore}%
          </Typography>
        </Box>
      </Box>

      {overallScore < 60 && (
        <Alert severity="warning" sx={{ mb: 3 }}>
          <Typography variant="body1" sx={{ fontWeight: 'bold' }}>
            Significant Mismatch Detected
          </Typography>
          <Typography variant="body2">
            Your resume shows limited alignment with the job requirements. Consider reviewing the job description carefully and updating your resume to better match the required skills and experience.
          </Typography>
        </Alert>
      )}

      <Grid container spacing={3}>
        {/* Technical Skills Comparison */}
        <Grid item xs={12}>
          <Card sx={{ 
            height: '100%',
            background: 'linear-gradient(145deg, #e3f2fd 0%, #bbdefb 100%)',
            borderRadius: 2
          }}>
            <CardContent>
              <Typography variant="h6" gutterBottom sx={{ 
                color: '#1976d2',
                fontWeight: 'bold',
                display: 'flex',
                alignItems: 'center'
              }}>
                <WorkIcon sx={{ mr: 1 }} />
                Technical Skills Analysis
              </Typography>
              <Grid container spacing={2}>
                <Grid item xs={6}>
                  <Typography variant="subtitle1" sx={{ color: '#1976d2', fontWeight: 'bold', mb: 2 }}>
                    Required Skills
                  </Typography>
                  <List>
                    {missingPoints.technical.map((point: string, index: number) => (
                      <ListItem key={index} sx={{ pl: 4 }}>
                        <ListItemText 
                          primary={point}
                          sx={{ 
                            '& .MuiListItemText-primary': {
                              color: '#424242',
                              fontSize: '0.95rem'
                            }
                          }}
                        />
                      </ListItem>
                    ))}
                  </List>
                </Grid>
                <Grid item xs={6}>
                  <Typography variant="subtitle1" sx={{ color: '#1976d2', fontWeight: 'bold', mb: 2 }}>
                    Your Skills
                  </Typography>
                  <List>
                    {keyStrengths.technical.map((strength: string, index: number) => (
                      <ListItem key={index} sx={{ pl: 4 }}>
                        <ListItemText 
                          primary={strength}
                          sx={{ 
                            '& .MuiListItemText-primary': {
                              color: '#424242',
                              fontSize: '0.95rem'
                            }
                          }}
                        />
                      </ListItem>
                    ))}
                  </List>
                </Grid>
              </Grid>
            </CardContent>
          </Card>
        </Grid>

        {/* Experience Comparison */}
        <Grid item xs={12}>
          <Card sx={{ 
            height: '100%',
            background: 'linear-gradient(145deg, #fff3e0 0%, #ffe0b2 100%)',
            borderRadius: 2
          }}>
            <CardContent>
              <Typography variant="h6" gutterBottom sx={{ 
                color: '#f57c00',
                fontWeight: 'bold',
                display: 'flex',
                alignItems: 'center'
              }}>
                <DescriptionIcon sx={{ mr: 1 }} />
                Experience Analysis
              </Typography>
              <Grid container spacing={2}>
                <Grid item xs={6}>
                  <Typography variant="subtitle1" sx={{ color: '#f57c00', fontWeight: 'bold', mb: 2 }}>
                    Required Experience
                  </Typography>
                  <List>
                    {missingPoints.experience.map((point: string, index: number) => (
                      <ListItem key={index} sx={{ pl: 4 }}>
                        <ListItemText 
                          primary={point}
                          sx={{ 
                            '& .MuiListItemText-primary': {
                              color: '#424242',
                              fontSize: '0.95rem'
                            }
                          }}
                        />
                      </ListItem>
                    ))}
                  </List>
                </Grid>
                <Grid item xs={6}>
                  <Typography variant="subtitle1" sx={{ color: '#f57c00', fontWeight: 'bold', mb: 2 }}>
                    Your Experience
                  </Typography>
                  <List>
                    {keyStrengths.experience.map((exp: string, index: number) => (
                      <ListItem key={index} sx={{ pl: 4 }}>
                        <ListItemText 
                          primary={exp}
                          sx={{ 
                            '& .MuiListItemText-primary': {
                              color: '#424242',
                              fontSize: '0.95rem'
                            }
                          }}
                        />
                      </ListItem>
                    ))}
                  </List>
                </Grid>
              </Grid>
            </CardContent>
          </Card>
        </Grid>

        {/* Recommendations */}
        <Grid item xs={12}>
          <Card sx={{ 
            height: '100%',
            background: 'linear-gradient(145deg, #e8f5e9 0%, #c8e6c9 100%)',
            borderRadius: 2
          }}>
            <CardContent>
              <Typography variant="h6" gutterBottom sx={{ 
                color: '#388e3c',
                fontWeight: 'bold',
                display: 'flex',
                alignItems: 'center'
              }}>
                <LogoutIcon sx={{ mr: 1 }} />
                Recommendations to Improve Match
              </Typography>
              <Grid container spacing={2}>
                <Grid item xs={6}>
                  <Typography variant="subtitle1" sx={{ color: '#388e3c', fontWeight: 'bold', mb: 2 }}>
                    Priority Skills to Add
                  </Typography>
                  <List>
                    {skillsToAdd.priority.map((skill: string, index: number) => (
                      <ListItem key={index} sx={{ pl: 4 }}>
                        <ListItemText 
                          primary={skill}
                          sx={{ 
                            '& .MuiListItemText-primary': {
                              color: '#424242',
                              fontSize: '0.95rem'
                            }
                          }}
                        />
                      </ListItem>
                    ))}
                  </List>
                </Grid>
                <Grid item xs={6}>
                  <Typography variant="subtitle1" sx={{ color: '#388e3c', fontWeight: 'bold', mb: 2 }}>
                    Additional Skills to Consider
                  </Typography>
                  <List>
                    {skillsToAdd.recommended.map((skill: string, index: number) => (
                      <ListItem key={index} sx={{ pl: 4 }}>
                        <ListItemText 
                          primary={skill}
                          sx={{ 
                            '& .MuiListItemText-primary': {
                              color: '#424242',
                              fontSize: '0.95rem'
                            }
                          }}
                        />
                      </ListItem>
                    ))}
                  </List>
                </Grid>
              </Grid>
            </CardContent>
          </Card>
        </Grid>

        {/* Action Plan */}
        <Grid item xs={12}>
          <Card sx={{ 
            height: '100%',
            background: 'linear-gradient(145deg, #fce4ec 0%, #f8bbd0 100%)',
            borderRadius: 2
          }}>
            <CardContent>
              <Typography variant="h6" gutterBottom sx={{ 
                color: '#c2185b',
                fontWeight: 'bold',
                display: 'flex',
                alignItems: 'center'
              }}>
                <CloudUploadIcon sx={{ mr: 1 }} />
                Action Plan
              </Typography>
              <Grid container spacing={2}>
                <Grid item xs={6}>
                  <Typography variant="subtitle1" sx={{ color: '#c2185b', fontWeight: 'bold', mb: 2 }}>
                    Short-term Actions
                  </Typography>
                  <List>
                    {recommendations.shortTerm.map((rec: string, index: number) => (
                      <ListItem key={index} sx={{ pl: 4 }}>
                        <ListItemText 
                          primary={rec}
                          sx={{ 
                            '& .MuiListItemText-primary': {
                              color: '#424242',
                              fontSize: '0.95rem'
                            }
                          }}
                        />
                      </ListItem>
                    ))}
                  </List>
                </Grid>
                <Grid item xs={6}>
                  <Typography variant="subtitle1" sx={{ color: '#c2185b', fontWeight: 'bold', mb: 2 }}>
                    Long-term Development
                  </Typography>
                  <List>
                    {recommendations.longTerm.map((rec: string, index: number) => (
                      <ListItem key={index} sx={{ pl: 4 }}>
                        <ListItemText 
                          primary={rec}
                          sx={{ 
                            '& .MuiListItemText-primary': {
                              color: '#424242',
                              fontSize: '0.95rem'
                            }
                          }}
                        />
                      </ListItem>
                    ))}
                  </List>
                </Grid>
              </Grid>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Card>
  );
};

const App: React.FC = () => {
  return (
    <AuthProvider>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <Router>
          <Routes>
            <Route path="/" element={<Navigate to="/login" replace />} />
            <Route path="/login" element={<Login />} />
            <Route path="/signup" element={<Signup />} />
            <Route
              path="/dashboard"
              element={
                <ProtectedRoute>
                  <Dashboard />
                </ProtectedRoute>
              }
            />
          </Routes>
        </Router>
      </ThemeProvider>
    </AuthProvider>
  );
};

export default App;
