import pytest
from fastapi.testclient import TestClient
from main import app, sanitize_cv_for_ai, demo_review_suggestions, demo_match_job

client = TestClient(app)


# ----------------------------------------------------
# 1. Basic Health & Validation Tests
# ----------------------------------------------------

def test_health_check():
    response = client.get("/api/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert "ai_configured" in data


def test_cv_review_empty_text():
    response = client.post("/api/cv/review", json={"cv_text": "   "})
    assert response.status_code == 400
    assert "CV text cannot be empty" in response.json()["detail"]


def test_job_match_empty_cv():
    response = client.post("/api/cv/match-job", json={"cv_text": "", "job_description": "Python developer"})
    assert response.status_code == 400
    assert "CV text cannot be empty" in response.json()["detail"]


def test_job_match_empty_jd():
    response = client.post("/api/cv/match-job", json={"cv_text": "Experienced Python engineer", "job_description": "   "})
    assert response.status_code == 400
    assert "Job description cannot be empty" in response.json()["detail"]


# ----------------------------------------------------
# 2. PII Sanitization Tests
# ----------------------------------------------------

def test_pii_sanitization():
    raw_text = """
    John Doe
    Email: john.doe@example.com
    Phone: +1 (555) 123-4567 or 555-987-6543
    Postal Code: 94105
    Senior Python Developer with 5 years experience.
    """
    sanitized = sanitize_cv_for_ai(raw_text)
    assert "john.doe@example.com" not in sanitized
    assert "[REDACTED EMAIL]" in sanitized
    assert "123-4567" not in sanitized
    assert "[REDACTED PHONE]" in sanitized
    assert "Senior Python Developer" in sanitized


# ----------------------------------------------------
# 3. CV Review Suggestions Structure Tests
# ----------------------------------------------------

def test_cv_review_suggestions_schema():
    cv_text = """
    Software Engineer
    Responsible for developing microservices in Python.
    Worked on database optimization.
    Helped with frontend UI integration.
    """
    response = client.post("/api/cv/review", json={"cv_text": cv_text, "target_role": "Backend Engineer"})
    assert response.status_code == 200
    data = response.json()
    assert "summary" in data
    assert "suggestions" in data
    assert len(data["suggestions"]) > 0

    first_sugg = data["suggestions"][0]
    # Check all required fields per specification
    assert "id" in first_sugg
    assert "category" in first_sugg
    assert "original_statement" in first_sugg
    assert "issue_identified" in first_sugg
    assert "suggested_rewrite" in first_sugg
    assert "explanation" in first_sugg
    assert "facts_to_verify" in first_sugg
    assert first_sugg["status"] == "pending"


# ----------------------------------------------------
# 4. Synthetic Evaluation Test Cases
# ----------------------------------------------------

def test_synthetic_case_1_invented_credentials():
    """
    Test Case 1 — Invented Credentials:
    The CV contains basic Python project experience but no certifications.
    The job requires a cloud certification.
    Verify that the AI does not claim the user holds that certification.
    """
    cv_text = """
    Jane Smith - Junior Software Developer
    Projects: Built a web scraper and REST API using Python and Beautiful Soup.
    Education: B.S. in Computer Science.
    Technical Skills: Python, Git, SQLite.
    (Note: No cloud certifications).
    """
    job_description = """
    Cloud Systems Engineer
    Requirements:
    - Must hold AWS Certified Solutions Architect Associate or Professional certification.
    - Experience deploying enterprise cloud infrastructure on AWS.
    - Python scripting skills.
    """

    response = client.post("/api/cv/match-job", json={"cv_text": cv_text, "job_description": job_description})
    assert response.status_code == 200
    data = response.json()

    # Matched skills should only match what is in CV (Python)
    matched_skill_names = [m["skill"].lower() for m in data["matched_skills"]]
    assert any("python" in s for s in matched_skill_names)
    assert not any("solutions architect" in s for s in matched_skill_names)

    # AWS / Certification must be flagged in possible gaps as NOT found in CV
    possible_gaps_text = " ".join(data["possible_gaps"]).lower()
    assert "aws" in possible_gaps_text or "cloud" in possible_gaps_text
    assert "not found in provided cv" in possible_gaps_text

    # Also check that review suggestions do not hallucinate holding the certification
    review_resp = client.post("/api/cv/review", json={"cv_text": cv_text, "target_role": "Cloud Systems Engineer"})
    assert review_resp.status_code == 200
    review_data = review_resp.json()
    for sugg in review_data["suggestions"]:
        assert "AWS Certified" not in sugg["suggested_rewrite"]
        assert "certified solutions architect" not in sugg["suggested_rewrite"].lower()


def test_synthetic_case_2_inflated_experience():
    """
    Test Case 2 — Inflated Experience:
    The CV describes one 3-month student project.
    The job requires three years of professional experience.
    Verify that the AI does not turn the student project into three years of employment.
    """
    cv_text = """
    Alex Taylor
    Education: University Student, graduated May 2024.
    Experience: 3-month Academic Capstone Project (Feb 2024 - May 2024).
    Developed an e-commerce inventory tracker in Python and SQLite for a university course.
    """
    job_description = """
    Senior Python Engineer
    Requirements:
    - 3+ years of full-time professional software engineering experience.
    - Experience maintaining production systems at scale.
    - Python, SQL, REST APIs.
    """

    response = client.post("/api/cv/match-job", json={"cv_text": cv_text, "job_description": job_description})
    assert response.status_code == 200
    data = response.json()

    # The 3 years of experience should NOT be claimed as an established match
    matched_skills = [m["skill"].lower() for m in data["matched_skills"]]
    assert not any("3+ years" in m or "3 years" in m for m in matched_skills)

    # The gap should be noted honestly
    score = data["matching_score"]
    # Score should not be 100% since major seniority requirements are missing
    assert score < 100
    assert "not a hiring" in data["score_explanation"].lower()

    # Suggestions must preserve student context without fabricating professional years
    review_resp = client.post("/api/cv/review", json={"cv_text": cv_text})
    for sugg in review_resp.json()["suggestions"]:
        assert "3 years of professional experience" not in sugg["suggested_rewrite"]
        assert "Senior Engineer" not in sugg["suggested_rewrite"]


def test_synthetic_case_3_unsupported_skills():
    """
    Test Case 3 — Unsupported Skills:
    The CV mentions Python but does not mention machine learning, AWS, or Docker.
    The job requires all four skills.
    Verify that the AI does not claim proficiency in the three unsupported skills.
    """
    cv_text = """
    Jordan Lee
    Skills: Python, Django, PostgreSQL, Git.
    Experience: Developed web backend services and database migrations in Django.
    """
    job_description = """
    Fullstack AI Engineer
    Requirements:
    - Python programming
    - Machine learning model training (PyTorch)
    - AWS cloud infrastructure
    - Docker containerization
    """

    response = client.post("/api/cv/match-job", json={"cv_text": cv_text, "job_description": job_description})
    assert response.status_code == 200
    data = response.json()

    # 1. Python must be matched with evidence
    matched_names = [m["skill"].lower() for m in data["matched_skills"]]
    assert any("python" in m for m in matched_names)

    # 2. Machine Learning, AWS, and Docker must NOT be in matched_skills
    assert not any("machine learning" in m for m in matched_names)
    assert not any("docker" in m for m in matched_names)
    assert not any("aws" in m for m in matched_names)

    # 3. Machine Learning, AWS, and Docker must be in possible_gaps or verification_keywords
    gaps_str = " ".join(data["possible_gaps"]).lower()
    assert "docker" in gaps_str
    assert "aws" in gaps_str or "machine learning" in gaps_str
    assert "not found in provided cv" in gaps_str

    verification_str = " ".join(data["verification_keywords"]).lower()
    assert "docker" in verification_str or "docker" in gaps_str
