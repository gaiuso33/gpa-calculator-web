function addCourse() {
  const container = document.getElementById('courses');
  const div = document.createElement('div');

  div.innerHTML = `
    <input type="number" placeholder="Unit" class="unit">
    <select class="grade">
      <option value="">Grade</option>
      <option value="A">A (4)</option>
      <option value="B">B (3)</option>
      <option value="C">C (2)</option>
      <option value="D">D (1)</option>
      <option value="F">F (0)</option>
    </select>
  `;
  container.appendChild(div);
}

function calculateGPA() {
  const units = document.querySelectorAll('.unit');
  const grades = document.querySelectorAll('.grade');

  let totalPoints = 0;
  let totalUnits = 0;

  for (let i = 0; i < units.length; i++) {
    const unit = parseFloat(units[i].value);
    const grade = grades[i].value.toUpperCase();

    const gradePoints = { A: 4, B: 3, C: 2, D: 1, F: 0 };
    if (!grade || isNaN(unit)) continue;

    totalUnits += unit;
    totalPoints += unit * gradePoints[grade];
  }

  const gpa = (totalPoints / totalUnits).toFixed(2);
  document.getElementById('result').textContent = `Your GPA is: ${gpa}`;
}
function resetForm() {
  document.getElementById('courses').innerHTML = '';
  document.getElementById('result').textContent = '';
}  
document.getElementById('addCourse').addEventListener('click', addCourse);
document.getElementById('calculateGPA').addEventListener('click', calculateGPA);
document.getElementById('resetForm').addEventListener('click', resetForm);    
document.addEventListener('DOMContentLoaded', () => {
  addCourse(); // Add the first course input on page load
});
// Ensure the initial course input is present when the page loads
document.getElementById('courses').innerHTML = `
  <div>
      <input type="number" placeholder="Unit" class="unit">
      <select class="grade">
         <option value="">Grade</option>
         <option value="A">A (4)</option>
         <option value="B">B (3)</option>
         <option value="C">C (2)</option>
         <option value="D">D (1)</option>
         <option value="F">F (0)</option>
      </select>      
   </div>
`;
