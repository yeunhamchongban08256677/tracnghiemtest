document.addEventListener('DOMContentLoaded', () => {
    // --- State ---
    let allQuestions = [];
    let quizSettings = {};
    let questionOrder = [];
    let retryQueue = [];
    let questionMastery = {};
    let currentPointer = 0;

    // --- UI Elements ---
    const mainQuizLayout = document.getElementById('main-quiz-layout');
    const endScreen = document.getElementById('end-screen');
    const questionText = document.getElementById('question-text');
    const answerButtons = document.getElementById('answer-buttons');
    const feedbackText = document.getElementById('feedback');
    const progressText = document.getElementById('progress-text');
    const progressBar = document.getElementById('progress-bar');
    const masteryProgress = document.getElementById('mastery-progress');
    const nextBtn = document.getElementById('next-btn');
    const restartQuizBtn = document.getElementById('restart-quiz-btn');
    const restartBtnEnd = document.getElementById('restart-btn-end');

    // --- Panel UI ---
    const reqCorrectCount = document.getElementById('req-correct-count');
    const masteredCount = document.getElementById('mastered-count');
    const totalQCount = document.getElementById('total-q-count');
    const masteryStatus = document.getElementById('mastery-status');

    // --- Utility Functions ---
    const shuffleArray = (array) => {
        for (let i = array.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [array[i], array[j]] = [array[j], array[i]];
        }
    };
    
    // --- Core Quiz Logic ---
    const startQuiz = () => {
        retryQueue = [];
        currentPointer = 0;
        questionMastery = {};
        allQuestions.forEach((_, index) => { questionMastery[index] = 0; });

        questionOrder = Array.from(allQuestions.keys());
        if (quizSettings.randomizeQuestions) {
            shuffleArray(questionOrder);
        }

        mainQuizLayout.classList.remove('hidden');
        endScreen.classList.add('hidden');
        masteryStatus.textContent = "Đang học...";
        
        updateProgress();
        handleNextQuestion();
    };

    const handleNextQuestion = () => {
        let nextQuestionIndex = -1;

        // Prioritize questions in the retry queue if the setting is enabled
        if (quizSettings.prioritizeUnmastered && retryQueue.length > 0) {
            nextQuestionIndex = retryQueue.shift();
        } 
        // Then go through the main order
        else if (currentPointer < questionOrder.length) {
            nextQuestionIndex = questionOrder[currentPointer];
            currentPointer++;
        } 
        // If done, check for unmastered questions
        else {
            const unmastered = allQuestions
                .map((_, i) => i)
                .filter(i => questionMastery[i] < quizSettings.repeatCount);
            
            if (unmastered.length === 0) {
                showEndScreen();
                return;
            }

            questionOrder = unmastered;
            if (quizSettings.randomizeQuestions) shuffleArray(questionOrder);
            currentPointer = 1;
            nextQuestionIndex = questionOrder[0];
        }
        
        if (nextQuestionIndex !== -1) {
            showQuestion(nextQuestionIndex);
        } else {
            showEndScreen();
        }
    };

    const showQuestion = (questionIndex) => {
        feedbackText.textContent = '';
        nextBtn.classList.add('hidden');
        answerButtons.innerHTML = '';
        
        const questionData = allQuestions[questionIndex];
        questionText.dataset.currentIndex = questionIndex;
        questionText.textContent = questionData.question;
        
        let options = [...questionData.options];
        if (quizSettings.randomizeAnswers) {
            shuffleArray(options);
        }

        options.forEach(optionText => {
            const button = document.createElement('button');
            button.textContent = optionText;
            button.classList.add('answer-btn');
            button.addEventListener('click', selectAnswer);
            answerButtons.appendChild(button);
        });
        updateProgress();
    };

    const selectAnswer = (e) => {
        const selectedButton = e.target;
        const questionIndex = parseInt(questionText.dataset.currentIndex, 10);
        const correctAnswer = allQuestions[questionIndex].correctAnswer;
        const isCorrect = selectedButton.textContent === correctAnswer;

        Array.from(answerButtons.children).forEach(button => button.disabled = true);
        
        if (isCorrect) {
            questionMastery[questionIndex]++;
            feedbackText.textContent = 'Chính xác!';
            feedbackText.className = 'mt-6 text-center font-bold text-green-600 min-h-[28px]';
            selectedButton.classList.add('correct');
        } else {
            questionMastery[questionIndex] = 0; // Reset mastery on wrong answer
            feedbackText.textContent = `Chưa đúng. Đáp án là: ${correctAnswer}`;
            feedbackText.className = 'mt-6 text-center font-bold text-red-600 min-h-[28px]';
            selectedButton.classList.add('incorrect');
            
            // Highlight the correct answer for learning
            const correctButton = Array.from(answerButtons.children).find(btn => btn.textContent === correctAnswer);
            if (correctButton) correctButton.classList.add('correct');
            
            // Add to retry queue if prioritization is enabled
            if (quizSettings.prioritizeUnmastered) {
                // Add to the front for immediate retry
                retryQueue.unshift(questionIndex); 
            }
        }
        
        updateProgress();
        nextBtn.classList.remove('hidden');
    };

    const updateProgress = () => {
        const totalQuestions = allQuestions.length;
        
        const masteredCountVal = Object.values(questionMastery).filter(c => c >= quizSettings.repeatCount).length;
        const overallProgress = totalQuestions > 0 ? (masteredCountVal / totalQuestions) * 100 : 0;
        progressBar.style.width = `${overallProgress}%`;

        progressText.innerText = `Câu ${currentPointer}/${questionOrder.length}`;
        masteryProgress.innerText = `Đã thuộc: ${masteredCountVal}/${totalQuestions}`;
        
        masteredCount.textContent = masteredCountVal;
    };

    const showEndScreen = () => {
        mainQuizLayout.classList.add('hidden');
        endScreen.classList.remove('hidden');
        document.getElementById('end-screen-stats').textContent = `Bạn đã học và trả lời đúng toàn bộ ${allQuestions.length} câu hỏi.`;
        masteryStatus.textContent = "Hoàn thành!";
    };
    
    // --- Initialization ---
    const init = () => {
        const questionsData = localStorage.getItem('quizApp_currentQuestions');
        const settingsData = localStorage.getItem('quizApp_settings');

        if (!questionsData || !settingsData) {
            alert("Không tìm thấy dữ liệu bài thi. Đang quay về trang chủ.");
            window.location.href = 'index.html';
            return;
        }

        allQuestions = JSON.parse(questionsData);
        quizSettings = JSON.parse(settingsData);
        
        // Populate control panel
        reqCorrectCount.textContent = quizSettings.repeatCount;
        totalQCount.textContent = allQuestions.length;

        // Bind events
        nextBtn.addEventListener('click', handleNextQuestion);
        restartQuizBtn.addEventListener('click', startQuiz);
        restartBtnEnd.addEventListener('click', startQuiz);
        
        startQuiz();
    };

    init();
});
