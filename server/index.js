const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const { createClient } = require('@supabase/supabase-js');
const axios = require('axios');
const pdfParse = require('pdf-parse');
const { OpenAI } = require('openai');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));  // Increase payload limit for base64 files

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// Configure multer for file upload
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'uploads/');
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + '-' + file.originalname);
  }
});

const upload = multer({ 
  storage: storage,
  fileFilter: function (req, file, cb) {
    if (file.mimetype !== 'application/pdf') {
      return cb(new Error('Only PDF files are allowed!'), false);
    }
    cb(null, true);
  }
});

// Create uploads directory if it doesn't exist
if (!fs.existsSync('uploads')) {
  fs.mkdirSync('uploads');
}

// Function to extract text from PDF
async function extractTextFromPDF(pdfBuffer) {
  try {
    const data = await pdfParse(pdfBuffer);
    return data.text;
  } catch (error) {
    console.error('Error extracting text from PDF:', error);
    throw new Error('Failed to extract text from PDF');
  }
}

// Function to analyze resume
async function analyzeResume(text) {
  try {
    const prompt = `Analyze the following resume and provide a detailed analysis. Focus on:
1. Overall match score (0-100) for a software engineering position
2. Key strengths
3. Missing points or areas for improvement
4. Skills to add or enhance
5. Specific recommendations for improvement

Resume text:
${text}

Provide the analysis in the following JSON format:
{
  "overallScore": number,
  "keyStrengths": string[],
  "missingPoints": string[],
  "skillsToAdd": string[],
  "recommendations": string[]
}`;

    console.log('Sending prompt to OpenAI:', prompt);

    const completion = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        {
          role: "system",
          content: "You are a professional resume analyzer. Analyze resumes and provide constructive feedback."
        },
        {
          role: "user",
          content: prompt
        }
      ],
      temperature: 0.7,
      max_tokens: 1000
    });

    console.log('OpenAI response:', completion.choices[0].message.content);

    const analysis = JSON.parse(completion.choices[0].message.content);
    
    console.log('Parsed analysis:', analysis);

    const result = {
      analysis: {
        overallScore: analysis.overallScore,
        keyStrengths: analysis.keyStrengths || [],
        missingPoints: analysis.missingPoints || [],
        skillsToAdd: analysis.skillsToAdd || [],
        recommendations: analysis.recommendations || []
      },
      contact: {
        email: text.match(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g)?.[0] || 'Not found',
        phone: text.match(/\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/g)?.[0] || 'Not found',
        linkedin: text.match(/(?:https?:\/\/)?(?:www\.)?linkedin\.com\/(?:in|company)\/[a-zA-Z0-9-]+\/?/g)?.[0] || 'Not found'
      },
      education: extractSection(text, 'education')?.split('\n').filter(line => line.trim()) || [],
      experience: extractSection(text, 'experience')?.split('\n').filter(line => line.trim()) || [],
      skills: extractSection(text, 'skills')?.split('\n').filter(line => line.trim()) || [],
      projects: extractSection(text, 'projects')?.split('\n').filter(line => line.trim()) || []
    };

    console.log('Final result:', result);

    return result;
  } catch (error) {
    console.error('Error analyzing resume with OpenAI:', error);
    throw error;
  }
}

// Helper function to extract sections
function extractSection(text, sectionName) {
  const sectionPatterns = {
    education: /education|academic|qualification/i,
    experience: /experience|work history|employment/i,
    skills: /skills|technical skills|competencies/i,
    projects: /projects|portfolio|work samples/i
  };

  const pattern = sectionPatterns[sectionName];
  if (!pattern) return null;

  const lines = text.split('\n');
  let sectionContent = [];
  let inSection = false;

  for (let line of lines) {
    if (pattern.test(line)) {
      inSection = true;
      continue;
    }
    if (inSection) {
      if (line.trim() === '') {
        break;
      }
      sectionContent.push(line.trim());
    }
  }

  return sectionContent.join('\n');
}

// Helper function to generate recommendations
function generateRecommendations(score, sections) {
  const recommendations = [];

  if (score < 75) {
    recommendations.push('Consider adding more details to your resume sections');
  }

  if (sections.education.length === 0) {
    recommendations.push('Add your educational background');
  }

  if (sections.experience.length === 0) {
    recommendations.push('Include your work experience');
  }

  if (sections.skills.length === 0) {
    recommendations.push('List your technical and soft skills');
  }

  if (sections.projects.length === 0) {
    recommendations.push('Add some of your notable projects');
  }

  return recommendations;
}

// API endpoint for file upload and text extraction
app.post('/api/upload', upload.single('resume'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const pdfBuffer = fs.readFileSync(req.file.path);
    const text = await extractTextFromPDF(pdfBuffer);

    // Clean up the uploaded file
    fs.unlinkSync(req.file.path);

    res.json({ text });
  } catch (error) {
    console.error('Error processing file:', error);
    res.status(500).json({ error: 'Failed to process file' });
  }
});

// API endpoint for resume analysis
app.post('/api/analyze', async (req, res) => {
  try {
    const { resumeText, jobDescription } = req.body;
    
    if (!resumeText || !jobDescription) {
      return res.status(400).json({ error: 'Resume text and job description are required' });
    }

    const prompt = `Analyze the following resume and job description to provide a detailed matching analysis. Consider both technical skills and experience requirements:

Resume:
${resumeText}

Job Description:
${jobDescription}

Provide a detailed analysis in the following JSON format:
{
  "overallScore": number, // Score out of 100 based on how well the resume matches the job requirements
  "keyStrengths": {
    "technical": string[], // Technical skills that match well with descriptions
    "experience": string[], // Relevant experience that aligns with job requirements
    "achievements": string[] // Specific achievements that demonstrate capability
  },
  "missingPoints": {
    "technical": string[], // Technical skills that need improvement with explanations
    "experience": string[], // Experience gaps that need to be addressed
    "softSkills": string[] // Soft skills or other areas that need development
  },
  "skillsToAdd": {
    "priority": string[], // High priority skills to acquire with reasons
    "recommended": string[] // Additional skills that would be beneficial
  },
  "recommendations": {
    "shortTerm": string[], // Immediate actions to improve match
    "longTerm": string[] // Long-term development suggestions
  }
}

IMPORTANT: Return ONLY the JSON object, no additional text or explanation.`;

    console.log('Sending prompt to OpenAI:', prompt);

    const completion = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        {
          role: "system",
          content: "You are an expert resume analyzer and career advisor. Analyze the resume and job description to provide detailed matching analysis and actionable recommendations. Return ONLY valid JSON."
        },
        {
          role: "user",
          content: prompt
        }
      ],
      temperature: 0.7,
      max_tokens: 2000
    });

    const response = completion.choices[0].message.content;
    console.log('OpenAI response:', response);

    // Clean the response to ensure it's valid JSON
    const cleanedResponse = response.replace(/```json\n?|\n?```/g, '').trim();
    console.log('Cleaned response:', cleanedResponse);

    const analysis = JSON.parse(cleanedResponse);
    console.log('Parsed analysis:', analysis);

    // Ensure all required fields are present with default values
    const result = {
      analysis: {
        overallScore: analysis.overallScore || 0,
        keyStrengths: {
          technical: Array.isArray(analysis.keyStrengths.technical) ? analysis.keyStrengths.technical : [],
          experience: Array.isArray(analysis.keyStrengths.experience) ? analysis.keyStrengths.experience : [],
          achievements: Array.isArray(analysis.keyStrengths.achievements) ? analysis.keyStrengths.achievements : []
        },
        missingPoints: {
          technical: Array.isArray(analysis.missingPoints.technical) ? analysis.missingPoints.technical : [],
          experience: Array.isArray(analysis.missingPoints.experience) ? analysis.missingPoints.experience : [],
          softSkills: Array.isArray(analysis.missingPoints.softSkills) ? analysis.missingPoints.softSkills : []
        },
        skillsToAdd: {
          priority: Array.isArray(analysis.skillsToAdd.priority) ? analysis.skillsToAdd.priority : [],
          recommended: Array.isArray(analysis.skillsToAdd.recommended) ? analysis.skillsToAdd.recommended : []
        },
        recommendations: {
          shortTerm: Array.isArray(analysis.recommendations.shortTerm) ? analysis.recommendations.shortTerm : [],
          longTerm: Array.isArray(analysis.recommendations.longTerm) ? analysis.recommendations.longTerm : []
        }
      },
      contact: {
        email: resumeText.match(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g)?.[0] || 'Not found',
        phone: resumeText.match(/\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/g)?.[0] || 'Not found',
        linkedin: resumeText.match(/(?:https?:\/\/)?(?:www\.)?linkedin\.com\/(?:in|company)\/[a-zA-Z0-9-]+\/?/g)?.[0] || 'Not found'
      },
      education: extractSection(resumeText, 'education')?.split('\n').filter(line => line.trim()) || [],
      experience: extractSection(resumeText, 'experience')?.split('\n').filter(line => line.trim()) || [],
      skills: extractSection(resumeText, 'skills')?.split('\n').filter(line => line.trim()) || [],
      projects: extractSection(resumeText, 'projects')?.split('\n').filter(line => line.trim()) || []
    };

    console.log('Final result:', result);
    res.json(result);
  } catch (error) {
    console.error('Error analyzing resume:', error);
    res.status(500).json({ error: 'Failed to analyze resume. Please try again.' });
  }
});

const PORT = process.env.PORT || 5030;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
}); 