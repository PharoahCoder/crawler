import { TermData, Course, Caches, Meeting, Section } from '../types';
import { cache, extract, match, regexExec } from '../utils';

export function parse(html: string, version: string): TermData {
  const courses: Record<string, Course> = {};
  const caches: Caches = {
    periods: [],
    dateRanges: [],
    scheduleTypes: [],
    campuses: [],
    attributes: [],
    gradeBases: [],
  };
  const updatedAt = new Date();

  const startIndex = html.indexOf('<caption class="captiontext">Sections Found</caption>');
  const endIndex = html.lastIndexOf('<table  CLASS="datadisplaytable" summary="This is for formatting of the bottom links." WIDTH="50%">');
  const body = html.slice(startIndex, endIndex);
  const sections = body.split('<tr>\n<th CLASS="ddtitle" scope="colgroup" >').slice(1);

  sections.forEach(section => {
    const [titlePart, descriptionPart, , ...meetingParts] = section.split('<tr>\n');

    const [, courseTitle, crn, courseId, sectionId] = regexExec(/^<a href=".+">(.+) - (\d{5}) - (\w+ \w+) - (.+)<\/a>/, titlePart);

    const fields: Record<string, string | undefined> = extract(descriptionPart, /^<SPAN class="fieldlabeltext">(.+): <\/SPAN>(.+)$/mg, results => {
      const [, key, value] = results;
      return { key, value };
    }).reduce((acc, { key, value }) => ({ ...acc, [key]: value }), {});
    const attributesKey = 'Attributes';
    const attributes = fields[attributesKey]?.split(',').map(attribute => attribute.trim()) ?? [];
    const gradeBasis = fields['Grade Basis'] ?? null;

    const credits = Number(match(descriptionPart, /(\d+\.\d{3}) Credits$/m));
    const scheduleType = match(descriptionPart, /^(.+) Schedule Type$/m);
    const campus = match(descriptionPart, /^(.+) Campus$/m);

    const scheduleTypeIndex = cache(caches.scheduleTypes, scheduleType);
    const campusIndex = cache(caches.campuses, campus);
    const attributeIndices = attributes.map(attribute => cache(caches.attributes, attribute));
    const gradeBasisIndex = cache(caches.gradeBases, gradeBasis);

    const meetings = meetingParts.map<Meeting>(meetingPart => {
      let [type, period, days, where, dateRange, scheduleType, instructorsString] = meetingPart.split('\n').slice(0, 7)
        .map(row => row.replace(/<\/?[^>]+(>|$)/g, ''));
      const instructors = instructorsString.replace(/ +/g, ' ').split(', ');
      const periodIndex = cache(caches.periods, period);
      const dateRangeIndex = cache(caches.dateRanges, dateRange);

      return [
        periodIndex,
        days,
        where,
        instructors,
        dateRangeIndex,
      ];
    });

    if (!(courseId in courses)) {
      const title = courseTitle;
      const sections: Record<string, Section> = {};
      courses[courseId] = [
        title,
        sections,
        // Start off with an empty prerequisites array
        [],
        // Start off with no description
        null,
      ];
    }
    courses[courseId][1][sectionId] = [
      crn,
      meetings,
      credits,
      scheduleTypeIndex,
      campusIndex,
      attributeIndices,
      gradeBasisIndex,
    ];
  });

  return { courses, caches, updatedAt, version };
}
