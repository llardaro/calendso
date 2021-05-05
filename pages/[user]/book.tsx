import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { ClockIcon, CalendarIcon } from '@heroicons/react/solid';
import prisma from '../../lib/prisma';
const dayjs = require('dayjs');

export default function Book(props) {
    const router = useRouter();
    const { date, user } = router.query;

    const bookingHandler = event => {
        event.preventDefault();
        const res = fetch(
            '/api/book/' + user,
            {
                body: JSON.stringify({
                    start: dayjs(date).format(),
                    end: dayjs(date).add(props.eventType.length, 'minute').format(),
                    name: event.target.name.value,
                    email: event.target.email.value,
                    notes: event.target.notes.value,
                    eventType: props.eventType
                  }),
                headers: {
                    'Content-Type': 'application/json'
                },
                method: 'POST'
            }
        );
        router.push("/success?date=" + date + "&type=" + props.eventType.id + "&user=" + props.user.username);
    }

    return (
        <div>
            <Head>
                <title>Confirm your {props.eventType.title} with {props.user.name || props.user.username} | ITC America</title>
                <link rel="icon" href="/favicon.ico" />
            </Head>

            <main className="max-w-3xl mx-auto my-24">
                <div className="bg-white overflow-hidden shadow rounded-lg">
                    <div className="sm:flex px-4 py-5 sm:p-6">
                        <div className="sm:w-1/2 sm:border-r">
                            {props.user.avatar && <img src={props.user.avatar} alt="Avatar" className="w-16 h-16 rounded-full mb-4"/>}
                            <h2 className="font-medium text-gray-500">{props.user.name}</h2>
                            <h1 className="text-3xl font-semibold text-gray-800 mb-4">{props.eventType.title}</h1>
                            <p className="text-gray-500 mb-2">
                                <ClockIcon className="inline-block w-4 h-4 mr-1 -mt-1" />
                                {props.eventType.length} minutes
                            </p>
                            <p className="text-blue-600 mb-4">
                                <CalendarIcon className="inline-block w-4 h-4 mr-1 -mt-1" />
                                {dayjs(date).format("hh:mma, dddd DD MMMM YYYY")}
                            </p>
                            <p className="text-gray-600">{props.eventType.description}</p>
                        </div>
                        <div className="sm:w-1/2 pl-8 pr-4">
                            <form onSubmit={bookingHandler}>
                                <div className="mb-4">
                                    <label htmlFor="name" className="block text-sm font-medium text-gray-700">Your name</label>
                                    <div className="mt-1">
                                        <input type="text" name="name" id="name" className="shadow-sm focus:ring-blue-500 focus:border-blue-500 block w-full sm:text-sm border-gray-300 rounded-md" placeholder="John Doe" />
                                    </div>
                                </div>
                                <div className="mb-4">
                                    <label htmlFor="email" className="block text-sm font-medium text-gray-700">Email address</label>
                                    <div className="mt-1">
                                        <input type="text" name="email" id="email" className="shadow-sm focus:ring-blue-500 focus:border-blue-500 block w-full sm:text-sm border-gray-300 rounded-md" placeholder="you@example.com" />
                                    </div>
                                </div>
                                <div className="mb-4">
                                    <label htmlFor="notes" className="block text-sm font-medium text-gray-700 mb-1">Additional notes</label>
                                    <textarea name="notes" id="notes" rows={3}  className="shadow-sm focus:ring-blue-500 focus:border-blue-500 block w-full sm:text-sm border-gray-300 rounded-md" placeholder="Please share anything that will help prepare for our meeting."></textarea>
                                </div>
                                <div>
                                    <button type="submit" className="btn btn-primary">Confirm</button>
                                    <Link href={"/" + props.user.username + "/" + props.eventType.slug}>
                                        <a className="ml-2 btn btn-white">Cancel</a>
                                    </Link>
                                </div>
                            </form>
                        </div>
                    </div>
                </div>
                <div className="flex justify-between mt-4">
                    <div>
                        <h1 className="text-3xl font-semibold text-gray-200 mb-1">ITC America</h1>
                        <p className="text-gray-300"><a href="https://itcamerica.net" target="_blank">www.itcamerica.net</a></p>
                        <p className="text-gray-300"><a href="tel:+17549005149">+1 (754) 900-5149</a></p>
                        <p className="text-gray-300">652 N University Drive, Pembroke Pines, Florida 33024</p>
                    </div>
                    <div>
                        <img src="../itc-white.png" alt="ITC" className="mx-auto h-14 mt-2"/>
                        <div className="flex justify-between">
                            <div>
                                <a href="https://www.facebook.com/ITCAmerica/" target="_blank"><img alt="Facebook" height="32" src="https://cdn.itcamerica.net/email-templates/calendso-event-added/facebook2x.png" style={{height: 'auto', border: 0, display: 'block'}} title="Facebook" width="32"/></a>
                            </div>
                            <div>
                                <a href="https://www.instagram.com/itcamerica/" target="_blank"><img alt="Instagram" height="32" src="https://cdn.itcamerica.net/email-templates/calendso-event-added/instagram2x.png" style={{height: 'auto', border: 0, display: 'block'}} title="Instagram" width="32"/></a>
                            </div>
                            <div>
                                <a href="https://www.linkedin.com/company/itc-america" target="_blank"><img alt="LinkedIn" height="32" src="https://cdn.itcamerica.net/email-templates/calendso-event-added/linkedin2x.png" style={{height: 'auto', border: 0, display: 'block'}} title="LinkedIn" width="32"/></a>
                            </div>
                        </div>
                    </div>
                </div>
            </main>
        </div>
    )
}

export async function getServerSideProps(context) {
    const user = await prisma.user.findFirst({
        where: {
          username: context.query.user,
        },
        select: {
            username: true,
            name: true,
            bio: true,
            avatar: true,
            eventTypes: true
        }
    });

    const eventType = await prisma.eventType.findUnique({
        where: {
          id: parseInt(context.query.type),
        },
        select: {
            id: true,
            title: true,
            slug: true,
            description: true,
            length: true
        }
    });

    return {
        props: {
            user,
            eventType
        },
    }
}